import type { Card } from '../types/poker'

export type ThreeCardStep = 'player' | 'bet' | 'showdown' | 'done'

export function getThreeCardStep(
  playerCount: number,
  betAction: 'play' | 'fold' | null,
  dealerCount: number
): ThreeCardStep {
  if (playerCount < 3) return 'player'
  if (!betAction) return 'bet'
  if (betAction === 'fold') return 'done'
  if (dealerCount < 3) return 'showdown'
  return 'done'
}

export function getThreeCardPlayerCards(cards: Record<string, Card | null>): Card[] {
  return ['p1', 'p2', 'p3'].map(id => cards[id]).filter((c): c is Card => !!c)
}

export function getThreeCardDealerCards(cards: Record<string, Card | null>): Card[] {
  return ['d1', 'd2', 'd3'].map(id => cards[id]).filter((c): c is Card => !!c)
}
