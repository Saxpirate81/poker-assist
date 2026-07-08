import type { Card } from '../types/poker'
import { normalizeCardFromAi, formatCardDisplay } from './pokerEval'
import { cardIdentity } from './handValidation'
import type { PhotoReadContext } from './geminiService'

export interface ParsedPhotoCards {
  dealerUp: Card | null
  playerCards: Card[]
  /** Flat list for legacy array responses (dealer first, then player L→R). */
  flat: Card[]
}

function dedupeCards(cards: Card[]): Card[] {
  const seen = new Set<string>()
  return cards.filter(c => {
    const id = cardIdentity(c)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function stripTableDuplicates(dealerUp: Card | null, playerCards: Card[]): Card[] {
  const withoutDupes = dedupeCards(playerCards)
  if (!dealerUp) return withoutDupes
  const upId = cardIdentity(dealerUp)
  return withoutDupes.filter(c => cardIdentity(c) !== upId)
}

function tableIdentities(existing: Record<string, Card | null>, excludeSlotIds: string[] = []): Set<string> {
  const exclude = new Set(excludeSlotIds)
  const ids = new Set<string>()
  for (const [slotId, card] of Object.entries(existing)) {
    if (card && !exclude.has(slotId)) ids.add(cardIdentity(card))
  }
  return ids
}

function findSlotWithIdentity(
  cards: Record<string, Card | null>,
  identity: string
): string | null {
  for (const [slotId, card] of Object.entries(cards)) {
    if (card && cardIdentity(card) === identity) return slotId
  }
  return null
}

/** Remove conflicts so photo results always apply when possible. */
export function sanitizePhotoMapping(
  mapping: Record<string, Card>,
  existing: Record<string, Card | null>
): { mapping: Record<string, Card>; warnings: string[] } {
  const warnings: string[] = []
  const result: Record<string, Card> = {}

  for (const [slotId, card] of Object.entries(mapping)) {
    const id = cardIdentity(card)

    // Same card already in this slot (re-photo refresh) — always OK
    if (existing[slotId] && cardIdentity(existing[slotId]!) === id) {
      result[slotId] = card
      continue
    }

    // Card already lives on a different slot — skip misread, keep existing
    const existingSlot = findSlotWithIdentity(existing, id)
    if (existingSlot && existingSlot !== slotId) {
      warnings.push(`${formatCardDisplay(card)} skipped (already on ${existingSlot.toUpperCase()})`)
      continue
    }

    // Duplicate within this photo batch
    if (Object.entries(result).some(([s, c]) => s !== slotId && cardIdentity(c) === id)) {
      warnings.push(`${formatCardDisplay(card)} skipped (duplicate in photo)`)
      continue
    }

    result[slotId] = card
  }

  return { mapping: result, warnings }
}

function parseCardList(raw: unknown): Card[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(item => normalizeCardFromAi(item as { rank?: string; suit?: string }))
    .filter((c): c is Card => !!c)
}

/** Extract a complete JSON array using bracket matching (avoids truncated/non-greedy bugs). */
function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf('[')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as unknown[]
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** Extract a complete JSON object using brace matching. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function parseVisionResponse(text: string, context: PhotoReadContext): ParsedPhotoCards {
  if (context === 'table') {
    const obj = extractJsonObject(text)
    if (obj && ('dealerUp' in obj || 'playerCards' in obj)) {
      const dealerRaw = obj.dealerUp
      const dealerUp = dealerRaw && typeof dealerRaw === 'object' && dealerRaw !== null
        ? normalizeCardFromAi(dealerRaw as { rank?: string; suit?: string })
        : null
      const playerCards = stripTableDuplicates(dealerUp, parseCardList(obj.playerCards))
      const flat = [...(dealerUp ? [dealerUp] : []), ...playerCards]
      return { dealerUp, playerCards, flat }
    }
  }

  const arr = extractJsonArray(text)
  const flat = parseCardList(arr ?? [])
  if (context === 'table' && flat.length >= 6) {
    const dealerUp = flat[0] ?? null
    const playerCards = stripTableDuplicates(dealerUp, flat.slice(1, 6))
    return { dealerUp, playerCards, flat: [...(dealerUp ? [dealerUp] : []), ...playerCards] }
  }
  if (context === 'table' && flat.length === 5) {
    return { dealerUp: null, playerCards: dedupeCards(flat), flat: dedupeCards(flat) }
  }
  if (context === 'dealer-up') {
    return { dealerUp: flat[0] ?? null, playerCards: [], flat }
  }
  if (context === 'dealer-rest') {
    const obj = extractJsonObject(text)
    if (obj && 'dealerHoleCards' in obj) {
      const hole = dedupeCards(parseCardList(obj.dealerHoleCards))
      return { dealerUp: null, playerCards: [], flat: hole }
    }
    return { dealerUp: null, playerCards: [], flat: dedupeCards(flat) }
  }
  return { dealerUp: null, playerCards: flat, flat }
}

export function mapDetectedCardsToSlots(
  parsed: ParsedPhotoCards,
  slotIds: string[],
  context: PhotoReadContext,
  existing: Record<string, Card | null>
): Record<string, Card> {
  const mapping: Record<string, Card> = {}
  const playerSlotIds = slotIds.filter(id => id.startsWith('p'))
  const hasDealer = !!existing['d1']

  if (context === 'table') {
    const knownUp = existing['d1'] ?? null

    // Dealer already logged — only fill player slots; ignore dealer in new photo
    if (hasDealer && knownUp) {
      const players = parsed.playerCards.length > 0
        ? stripTableDuplicates(knownUp, parsed.playerCards)
        : stripTableDuplicates(
          knownUp,
          parsed.flat.length >= 6 ? parsed.flat.slice(1, 6) : dedupeCards(parsed.flat)
        )
      playerSlotIds.forEach((id, i) => {
        if (players[i]) mapping[id] = players[i]!
      })
      return mapping
    }

    if (parsed.dealerUp) {
      mapping['d1'] = parsed.dealerUp
    }
    if (parsed.playerCards.length > 0) {
      playerSlotIds.forEach((id, i) => {
        if (parsed.playerCards[i]) mapping[id] = parsed.playerCards[i]!
      })
      return mapping
    }
    const cards = parsed.flat
    if (cards.length >= 6) {
      mapping['d1'] = cards[0]!
      playerSlotIds.forEach((id, i) => { if (cards[i + 1]) mapping[id] = cards[i + 1]! })
    } else if (cards.length === 5) {
      playerSlotIds.forEach((id, i) => { if (cards[i]) mapping[id] = cards[i]! })
    } else if (cards.length === 1) {
      mapping['d1'] = cards[0]!
    }
    return mapping
  }

  if (context === 'dealer-up') {
    if (parsed.dealerUp ?? parsed.flat[0]) mapping['d1'] = (parsed.dealerUp ?? parsed.flat[0])!
    return mapping
  }

  if (context === 'player-hand') {
    const cards = dedupeCards(parsed.playerCards.length > 0 ? parsed.playerCards : parsed.flat)
    playerSlotIds.length > 0
      ? playerSlotIds.forEach((id, i) => { if (cards[i]) mapping[id] = cards[i]! })
      : slotIds.forEach((id, i) => { if (cards[i]) mapping[id] = cards[i]! })
    return mapping
  }

  if (context === 'dealer-rest') {
    const holeSlotIds = slotIds.filter(id => /^d[2-5]$/.test(id))
    const taken = tableIdentities(existing, holeSlotIds)
    const cards = dedupeCards(parsed.flat).filter(c => !taken.has(cardIdentity(c)))
    // Order on felt may differ — fill D2–D5 with unique hole cards (order doesn't affect score)
    holeSlotIds.forEach((id, i) => {
      if (cards[i]) mapping[id] = cards[i]!
    })
    return mapping
  }

  // generic fallback
  slotIds.forEach((id, i) => {
    const card = parsed.flat[i]
    if (card) mapping[id] = card
  })
  return mapping
}

export function minCardsForContext(context: PhotoReadContext, expectedCount: number, hasDealer: boolean): number {
  if (context === 'table') {
    // One table photo: prefer full 6; accept 5 player-only if dealer already logged
    if (hasDealer) return 5
    return 6
  }
  if (context === 'player-hand') return Math.min(3, expectedCount)
  if (context === 'dealer-rest') return 4
  return 1
}
