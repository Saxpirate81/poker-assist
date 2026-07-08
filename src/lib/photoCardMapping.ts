import type { Card } from '../types/poker'
import { normalizeCardFromAi } from './pokerEval'
import type { PhotoReadContext } from './geminiService'

export interface ParsedPhotoCards {
  dealerUp: Card | null
  playerCards: Card[]
  /** Flat list for legacy array responses (dealer first, then player L→R). */
  flat: Card[]
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
      const playerCards = parseCardList(obj.playerCards)
      const flat = [...(dealerUp ? [dealerUp] : []), ...playerCards]
      return { dealerUp, playerCards, flat }
    }
  }

  const arr = extractJsonArray(text)
  const flat = parseCardList(arr ?? [])
  if (context === 'table' && flat.length >= 6) {
    return { dealerUp: flat[0] ?? null, playerCards: flat.slice(1, 6), flat }
  }
  if (context === 'table' && flat.length === 5) {
    return { dealerUp: null, playerCards: flat, flat }
  }
  if (context === 'dealer-up') {
    return { dealerUp: flat[0] ?? null, playerCards: [], flat }
  }
  if (context === 'dealer-rest') {
    return { dealerUp: null, playerCards: [], flat }
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
    if (parsed.dealerUp && !hasDealer) {
      mapping['d1'] = parsed.dealerUp
    }
    if (parsed.playerCards.length > 0) {
      playerSlotIds.forEach((id, i) => {
        if (parsed.playerCards[i]) mapping[id] = parsed.playerCards[i]!
      })
      return mapping
    }
    // Legacy flat array fallback
    const cards = parsed.flat
    if (cards.length === 6) {
      mapping['d1'] = cards[0]!
      playerSlotIds.forEach((id, i) => { mapping[id] = cards[i + 1]! })
    } else if (cards.length === 5) {
      playerSlotIds.forEach((id, i) => { mapping[id] = cards[i]! })
    } else if (cards.length === 1 && !hasDealer) {
      mapping['d1'] = cards[0]!
    }
    return mapping
  }

  if (context === 'dealer-up') {
    if (parsed.dealerUp ?? parsed.flat[0]) mapping['d1'] = (parsed.dealerUp ?? parsed.flat[0])!
    return mapping
  }

  if (context === 'player-hand') {
    const cards = parsed.playerCards.length > 0 ? parsed.playerCards : parsed.flat
    playerSlotIds.length > 0
      ? playerSlotIds.forEach((id, i) => { if (cards[i]) mapping[id] = cards[i]! })
      : slotIds.forEach((id, i) => { if (cards[i]) mapping[id] = cards[i]! })
    return mapping
  }

  // dealer-rest and generic
  slotIds.forEach((id, i) => {
    const card = parsed.flat[i]
    if (card) mapping[id] = card
  })
  return mapping
}

export function minCardsForContext(context: PhotoReadContext, expectedCount: number, hasDealer: boolean): number {
  if (context === 'table') {
    if (hasDealer) return Math.min(5, expectedCount)
    return Math.min(6, expectedCount)
  }
  if (context === 'player-hand') return Math.min(3, expectedCount)
  if (context === 'dealer-rest') return Math.min(2, expectedCount)
  return 1
}
