import type { Card } from '../types/poker'
import type { EvaluatedHand } from './pokerEval'
import { evaluateHand, rankValue } from './pokerEval'

export type CaribbeanStep = 'dealer-up' | 'player' | 'bet' | 'showdown' | 'done'

export function getCaribbeanStep(
  dealerUpCard: Card | null,
  playerCards: Card[],
  betAction: 'raise' | 'fold' | null,
  dealerRestCount: number
): CaribbeanStep {
  if (!dealerUpCard) return 'dealer-up'
  if (playerCards.length < 5) return 'player'
  if (!betAction) return 'bet'
  if (dealerRestCount < 4) return 'showdown'
  return 'done'
}

/**
 * Strategy using dealer up-card (Wizard of Odds style):
 * - Always raise pair+
 * - Raise Ace-high w/ J+ kicker if dealer up-card rank appears in your hand
 * - Raise AK/AQ/AJ when dealer shows A, K, Q, or J and you match
 */
export function shouldCaribbeanRaise(
  playerCards: Card[],
  dealerUpCard?: Card | null
): boolean {
  if (playerCards.length !== 5) return false
  const eval5 = evaluateHand(playerCards)
  if (!eval5) return false
  if (eval5.score >= 100) return true

  const pValues = playerCards.map(c => rankValue(c.rank))
  const pRanks = new Set(playerCards.map(c => c.rank))

  if (!dealerUpCard) {
    if (!pValues.includes(14)) return false
    return Math.max(...pValues.filter(v => v !== 14)) >= 11
  }

  const upVal = rankValue(dealerUpCard.rank)
  const upRank = dealerUpCard.rank

  if (pRanks.has(upRank)) {
    if (pValues.includes(14)) return true
  }

  if (pValues.includes(14)) {
    const kicker = Math.max(...pValues.filter(v => v !== 14))
    if (kicker >= 11) {
      if (upVal >= 11) return true
      if (upVal === 14 || upVal === 13) return true
    }
    if (upRank === 'A' || upRank === 'K') {
      if (pRanks.has('A') && pRanks.has('K')) return true
      if (pRanks.has('A') && pRanks.has('Q')) return true
      if (pRanks.has('A') && pRanks.has('J')) return true
    }
  }

  return false
}

export function getRaiseReason(
  playerCards: Card[],
  hand: EvaluatedHand | null,
  dealerUpCard?: Card | null
): string {
  if (!hand) return ''
  if (hand.rank !== 'high_card') return `${hand.label} — always raise`
  if (dealerUpCard && playerCards.some(c => c.rank === dealerUpCard.rank)) {
    return `You match dealer ${dealerUpCard.rank} — raise`
  }
  if (playerCards.some(c => c.rank === 'A')) {
    return 'Ace-high with J+ kicker — raise'
  }
  return ''
}

/** True when the evaluated 5-card hand is a real pair or better (not high-card). */
export function isPairOrBetter(hand: EvaluatedHand | null): boolean {
  return !!hand && hand.rank !== 'high_card'
}
