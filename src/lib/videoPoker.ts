import type { Card } from '../types/poker'
import type { EvaluatedHand, HandRank } from './pokerEval'
import { evaluateHand } from './pokerEval'
import { formatMoneyWithSymbol } from './money'

export type VideoPokerStep = 'deal' | 'hold' | 'draw' | 'done'

export function getVideoPokerStep(
  cardCount: number,
  holdsConfirmed: boolean,
  drawComplete: boolean
): VideoPokerStep {
  if (cardCount < 5) return 'deal'
  if (!holdsConfirmed) return 'hold'
  if (!drawComplete) return 'draw'
  return 'done'
}

const JOB_PAY: Partial<Record<HandRank, number>> = {
  royal_flush: 250,
  straight_flush: 50,
  four_kind: 25,
  full_house: 9,
  flush: 6,
  straight: 4,
  three_kind: 3,
  two_pair: 2,
  pair: 1,
}

export function videoPokerPayout(hand: EvaluatedHand | null, bet: number, variant: string): number {
  if (!hand) return 0
  if (variant === 'deuces-wild') {
    if (hand.rank === 'four_kind') return bet * 15
    if (hand.rank === 'full_house') return bet * 3
    if (hand.rank === 'flush') return bet * 2
    if (hand.rank === 'straight') return bet * 2
    if (hand.rank === 'three_kind') return bet * 1
  }
  if (hand.rank === 'pair') {
    const pairRank = hand.tiebreakers[0] ?? 0
    if (pairRank < 11) return 0
  }
  if (hand.rank === 'high_card') return 0
  const mult = JOB_PAY[hand.rank] ?? 0
  return bet * mult
}

export function calculateVideoPokerOutcome(
  cards: Card[],
  bet: number,
  variant: string
): { summary: string; netResult: number; payout: number } {
  const hand = cards.length === 5 ? evaluateHand(cards) : null
  const payout = videoPokerPayout(hand, bet, variant)
  const net = payout - bet
  const fmt = (n: number) => formatMoneyWithSymbol(n)
  if (payout === 0) {
    return {
      summary: hand ? `${hand.label} — no pay (${fmt(-bet)})` : `No hand (${fmt(-bet)})`,
      netResult: -bet,
      payout: 0,
    }
  }
  return {
    summary: `${hand!.label} — paid ${fmt(payout)} (${net >= 0 ? '+' : ''}${fmt(net)})`,
    netResult: net,
    payout,
  }
}

/** Simple hold advice for Jacks or Better. */
export function suggestVideoPokerHolds(cards: Card[]): Set<number> {
  const held = new Set<number>()
  if (cards.length !== 5) return held
  const hand = evaluateHand(cards)!
  if (hand.score >= 100) {
    cards.forEach((_, i) => held.add(i))
    return held
  }
  const ranks = cards.map(c => c.rank)
  const rankCounts = new Map<string, number>()
  ranks.forEach(r => rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1))
  const pairs = [...rankCounts.entries()].filter(([, n]) => n >= 2)
  if (pairs.length > 0) {
    const pairRank = pairs.sort((a, b) => b[1] - a[1])[0]![0]
    cards.forEach((c, i) => { if (c.rank === pairRank) held.add(i) })
    return held
  }
  const highRanks = new Set(['A', 'K', 'Q', 'J', 'T'])
  cards.forEach((c, i) => { if (highRanks.has(c.rank)) held.add(i) })
  return held
}
