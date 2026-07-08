import type { Card } from '../types/poker'
import { formatCardDisplay } from './pokerEval'

export function cardIdentity(c: Card): string {
  return `${c.rank}-${c.suit}`
}

/** Same physical card cannot appear on player and dealer hands. */
export function findDuplicateCards(...groups: Card[][]): string | null {
  const seen = new Map<string, string>()
  for (const group of groups) {
    for (const c of group) {
      const id = cardIdentity(c)
      if (seen.has(id)) {
        return `${formatCardDisplay(c)} appears more than once`
      }
      seen.set(id, id)
    }
  }
  return null
}

export interface HandValidationResult {
  ok: boolean
  message?: string
}

export function validatePlayerHand(cards: Card[]): HandValidationResult {
  if (cards.length !== 5) {
    return { ok: false, message: `Need 5 player cards (have ${cards.length})` }
  }
  const dup = findDuplicateCards(cards)
  if (dup) return { ok: false, message: dup }
  return { ok: true }
}

export function validateDealerUp(card: Card | null): HandValidationResult {
  if (!card) return { ok: false, message: 'Log dealer up-card first' }
  return { ok: true }
}

export function validateFullDealerHand(up: Card | null, hole: Card[]): HandValidationResult {
  if (!up) return { ok: false, message: 'Missing dealer up-card' }
  if (hole.length !== 4) {
    return { ok: false, message: `Need 4 dealer hole cards (have ${hole.length})` }
  }
  const all = [up, ...hole]
  const dup = findDuplicateCards(all)
  if (dup) return { ok: false, message: dup }
  return { ok: true }
}

export function validateTableForBet(playerCards: Card[], dealerUp: Card | null): HandValidationResult {
  const upCheck = validateDealerUp(dealerUp)
  if (!upCheck.ok) return upCheck
  const playerCheck = validatePlayerHand(playerCards)
  if (!playerCheck.ok) return playerCheck
  const dup = findDuplicateCards(playerCards, dealerUp ? [dealerUp] : [])
  if (dup) return { ok: false, message: dup }
  return { ok: true }
}

export function validateTableForScore(
  playerCards: Card[],
  dealerUp: Card | null,
  dealerHole: Card[],
  action: 'raise' | 'fold'
): HandValidationResult {
  const tableCheck = validateTableForBet(playerCards, dealerUp)
  if (!tableCheck.ok) return tableCheck

  if (action === 'raise') {
    const dealerCheck = validateFullDealerHand(dealerUp, dealerHole)
    if (!dealerCheck.ok) return dealerCheck
    const dup = findDuplicateCards(playerCards, dealerUp ? [dealerUp, ...dealerHole] : [])
    if (dup) return { ok: false, message: dup }
  } else if (dealerHole.length > 0 && dealerUp) {
    const dup = findDuplicateCards(playerCards, [dealerUp, ...dealerHole])
    if (dup) return { ok: false, message: dup }
  }

  return { ok: true }
}

export function validatePhotoMapping(
  mapping: Record<string, Card>,
  existing: Record<string, Card | null>
): HandValidationResult {
  const merged: Card[] = []
  const keys = new Set([...Object.keys(existing), ...Object.keys(mapping)])
  for (const key of keys) {
    const c = mapping[key] ?? existing[key]
    if (c) merged.push(c)
  }
  const dup = findDuplicateCards(merged)
  if (dup) return { ok: false, message: `Photo would create duplicate: ${dup}` }
  return { ok: true }
}
