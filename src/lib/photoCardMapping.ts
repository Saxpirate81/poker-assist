import type { Card } from '../types/poker'
import { normalizeCardFromAi, formatCardDisplay } from './pokerEval'
import { cardIdentity } from './handValidation'
import type { PhotoReadContext } from './geminiService'

export interface ParsedPhotoCards {
  dealerUp: Card | null
  playerCards: Card[]
  /** Showdown: exactly the 4 hole cards (not up-card). */
  dealerHoleCards: Card[]
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

function playerIdentities(existing: Record<string, Card | null>): Set<string> {
  const ids = new Set<string>()
  for (const [slotId, card] of Object.entries(existing)) {
    if (card && slotId.startsWith('p')) ids.add(cardIdentity(card))
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

const HOLE_SLOT_IDS = ['d2', 'd3', 'd4', 'd5']

/** Strip markdown fences / prose so JSON extractors see clean payloads. */
export function cleanVisionText(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] ?? trimmed).trim()
}

function pickArray(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj) return obj[key]
  }
  return undefined
}

/** Union every dealer card the model returned (object fields + arrays). */
function collectDealerPool(parsed: ParsedPhotoCards): Card[] {
  const pool: Card[] = []
  if (parsed.dealerUp) pool.push(parsed.dealerUp)
  pool.push(...parsed.dealerHoleCards)
  pool.push(...parsed.flat)
  return dedupeCards(pool)
}

export function countDealerHoles(parsed: ParsedPhotoCards, knownUp: Card | null): number {
  const upId = knownUp ? cardIdentity(knownUp) : (parsed.dealerUp ? cardIdentity(parsed.dealerUp) : null)
  let holes = collectDealerPool(parsed)
  if (upId) holes = holes.filter(c => cardIdentity(c) !== upId)
  return holes.length
}

/** Showdown photos replace the hole row — allow reorder without duplicate skips. */
export function sanitizeShowdownMapping(
  mapping: Record<string, Card>,
  existing: Record<string, Card | null>
): { mapping: Record<string, Card>; warnings: string[] } {
  const warnings: string[] = []
  const result: Record<string, Card> = {}
  const players = playerIdentities(existing)
  const seen = new Set<string>()

  for (const [slotId, card] of Object.entries(mapping)) {
    if (!slotId.startsWith('d')) continue
    const id = cardIdentity(card)
    if (players.has(id)) {
      warnings.push(`${formatCardDisplay(card)} skipped (player card)`)
      continue
    }
    if (seen.has(id)) {
      warnings.push(`${formatCardDisplay(card)} skipped (duplicate in photo)`)
      continue
    }
    seen.add(id)
    result[slotId] = card
  }

  return { mapping: result, warnings }
}

function mapShowdownDealer(
  parsed: ParsedPhotoCards,
  existing: Record<string, Card | null>
): Record<string, Card> {
  const mapping: Record<string, Card> = {}
  const players = playerIdentities(existing)
  const knownUp = existing['d1'] ?? parsed.dealerUp
  const upId = knownUp ? cardIdentity(knownUp) : null

  let holes = collectDealerPool(parsed)
  holes = holes.filter(c => !players.has(cardIdentity(c)))
  if (upId) {
    holes = holes.filter(c => cardIdentity(c) !== upId)
  }
  holes = dedupeCards(holes)

  if (parsed.dealerUp && !existing['d1']) {
    mapping['d1'] = parsed.dealerUp
  }

  holes.slice(0, 4).forEach((card, i) => {
    mapping[HOLE_SLOT_IDS[i]!] = card
  })

  return mapping
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

    if (existing[slotId] && cardIdentity(existing[slotId]!) === id) {
      result[slotId] = card
      continue
    }

    const existingSlot = findSlotWithIdentity(existing, id)
    if (existingSlot && existingSlot !== slotId) {
      warnings.push(`${formatCardDisplay(card)} skipped (already on ${existingSlot.toUpperCase()})`)
      continue
    }

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
  const cleaned = cleanVisionText(text)
  const start = cleaned.indexOf('[')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '[') depth++
    else if (cleaned[i] === ']') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as unknown[]
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
  const cleaned = cleanVisionText(text)
  const start = cleaned.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as Record<string, unknown>
        } catch {
          // Fallback: slice from first { to last } (handles minor trailing junk)
          try {
            const end = cleaned.lastIndexOf('}')
            if (end > start) {
              return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
            }
          } catch { /* ignore */ }
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
    if (obj && ('dealerUp' in obj || 'playerCards' in obj || 'dealer_up' in obj || 'player_cards' in obj || 'cards' in obj)) {
      const dealerRaw = pickArray(obj, 'dealerUp', 'dealer_up', 'dealer')
      const dealerUp = dealerRaw && typeof dealerRaw === 'object' && dealerRaw !== null && !Array.isArray(dealerRaw)
        ? normalizeCardFromAi(dealerRaw as { rank?: string; suit?: string })
        : null
      const playerRaw = pickArray(obj, 'playerCards', 'player_cards', 'player', 'players')
      let playerCards = stripTableDuplicates(dealerUp, parseCardList(playerRaw))
      if (playerCards.length === 0 && Array.isArray(obj.cards)) {
        const all = parseCardList(obj.cards)
        if (all.length >= 6) {
          const up = all[0] ?? null
          playerCards = stripTableDuplicates(up, all.slice(1, 6))
          if (!dealerUp && up) {
            return { dealerUp: up, playerCards, dealerHoleCards: [], flat: [...(up ? [up] : []), ...playerCards] }
          }
        }
      }
      const flat = [...(dealerUp ? [dealerUp] : []), ...playerCards]
      return { dealerUp, playerCards, dealerHoleCards: [], flat }
    }
  }

  const arr = extractJsonArray(text)
  const flat = parseCardList(arr ?? [])
  if (context === 'table' && flat.length >= 6) {
    const dealerUp = flat[0] ?? null
    const playerCards = stripTableDuplicates(dealerUp, flat.slice(1, 6))
    return { dealerUp, playerCards, dealerHoleCards: [], flat: [...(dealerUp ? [dealerUp] : []), ...playerCards] }
  }
  if (context === 'table' && flat.length === 5) {
    const playerCards = dedupeCards(flat)
    return { dealerUp: null, playerCards, dealerHoleCards: [], flat: playerCards }
  }
  if (context === 'dealer-up') {
    return { dealerUp: flat[0] ?? null, playerCards: [], dealerHoleCards: [], flat }
  }
  if (context === 'dealer-rest') {
    const obj = extractJsonObject(text)
    const arr = extractJsonArray(text)
    const arrCards = parseCardList(arr ?? [])
    let dealerUp: Card | null = null
    let dealerHoleCards: Card[] = []

    if (obj && ('dealerUp' in obj || 'dealerHoleCards' in obj || 'dealerCards' in obj || 'dealer_hole_cards' in obj || 'dealer_cards' in obj)) {
      const dealerRaw = pickArray(obj, 'dealerUp', 'dealer_up', 'dealer')
      dealerUp = dealerRaw && typeof dealerRaw === 'object' && dealerRaw !== null && !Array.isArray(dealerRaw)
        ? normalizeCardFromAi(dealerRaw as { rank?: string; suit?: string })
        : null
      if ('dealerHoleCards' in obj || 'dealer_hole_cards' in obj) {
        dealerHoleCards = parseCardList(pickArray(obj, 'dealerHoleCards', 'dealer_hole_cards'))
      }
      if ('dealerCards' in obj || 'dealer_cards' in obj) {
        const all = dedupeCards(parseCardList(pickArray(obj, 'dealerCards', 'dealer_cards')))
        if (!dealerUp) dealerUp = all[0] ?? null
        dealerHoleCards = [...dealerHoleCards, ...all.slice(dealerUp ? 1 : 0)]
      }
      dealerHoleCards = dedupeCards(dealerHoleCards)
      const flat = dedupeCards([...(dealerUp ? [dealerUp] : []), ...dealerHoleCards, ...arrCards])
      return { dealerUp, playerCards: [], dealerHoleCards, flat }
    }
    const deduped = dedupeCards([...arrCards, ...flat])
    return { dealerUp: null, playerCards: [], dealerHoleCards: deduped, flat: deduped }
  }
  return { dealerUp: null, playerCards: flat, dealerHoleCards: [], flat }
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
    return mapShowdownDealer(parsed, existing)
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
    // Dealer already logged — only need player row (accept partial for re-snaps)
    if (hasDealer) return 3
    return 6
  }
  if (context === 'player-hand') return Math.min(3, expectedCount)
  if (context === 'dealer-rest') return 4
  return 1
}
