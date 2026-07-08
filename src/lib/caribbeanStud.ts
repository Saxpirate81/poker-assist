import type { Card } from '../types/poker'
import type { EvaluatedHand, HandRank } from './pokerEval'
import { evaluateHand, rankValue, formatRankDisplay } from './pokerEval'

export type CaribbeanPhase = 'ante' | 'cards' | 'decision' | 'showdown'

/** Standard ante bonus pay table (multiplier on ante). */
export const ANTE_PAY_TABLE: { rank: HandRank; label: string; payout: number }[] = [
  { rank: 'royal_flush', label: 'Royal Flush', payout: 100 },
  { rank: 'straight_flush', label: 'Straight Flush', payout: 50 },
  { rank: 'four_kind', label: 'Four of a Kind', payout: 20 },
  { rank: 'full_house', label: 'Full House', payout: 7 },
  { rank: 'flush', label: 'Flush', payout: 5 },
  { rank: 'straight', label: 'Straight', payout: 4 },
  { rank: 'three_kind', label: 'Three of a Kind', payout: 3 },
  { rank: 'two_pair', label: 'Two Pair', payout: 2 },
  { rank: 'pair', label: 'One Pair', payout: 1 },
  { rank: 'high_card', label: 'High Card / A-K', payout: 1 },
]

export interface CaribbeanHandRecord {
  id: string
  timestamp: number
  playerCards: Card[]
  dealerCards?: Card[]
  playerHand: string
  action: 'raise' | 'fold'
  ante: number
  raiseAmount: number
  progressiveBet: number
  netResult?: number
  outcome?: string
}

export interface CaribbeanSession {
  bankroll: number
  handsPlayed: number
  raises: number
  folds: number
  wins: number
  losses: number
  netPnL: number
  handHistory: CaribbeanHandRecord[]
}

const SESSION_KEY = 'poker-assist-caribbean-session'
const RULES_KEY = 'poker-assist-caribbean-rules'

export function loadCaribbeanSession(): CaribbeanSession {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw) as CaribbeanSession
  } catch { /* ignore */ }
  return {
    bankroll: 500,
    handsPlayed: 0,
    raises: 0,
    folds: 0,
    wins: 0,
    losses: 0,
    netPnL: 0,
    handHistory: [],
  }
}

export function saveCaribbeanSession(session: CaribbeanSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadCaribbeanRules(): Record<string, number | boolean | string> | null {
  try {
    const raw = localStorage.getItem(RULES_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

export function saveCaribbeanRules(rules: Record<string, number | boolean | string>): void {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules))
}

export { shouldCaribbeanRaise, getRaiseReason } from './caribbeanFlow'

export function dealerQualifies(cards: Card[]): boolean {
  if (cards.length !== 5) return false
  const values = cards.map(c => rankValue(c.rank))
  return values.includes(14) && values.includes(13)
}

function anteBonusMultiplier(hand: EvaluatedHand): number {
  const row = ANTE_PAY_TABLE.find(r => r.rank === hand.rank)
  return row?.payout ?? 1
}

function compareHands(player: EvaluatedHand, dealer: EvaluatedHand): 'win' | 'lose' | 'push' {
  if (player.score !== dealer.score) {
    return player.score > dealer.score ? 'win' : 'lose'
  }
  for (let i = 0; i < Math.max(player.tiebreakers.length, dealer.tiebreakers.length); i++) {
    const p = player.tiebreakers[i] ?? 0
    const d = dealer.tiebreakers[i] ?? 0
    if (p !== d) return p > d ? 'win' : 'lose'
  }
  return 'push'
}

export interface CaribbeanOutcome {
  summary: string
  netResult: number
  anteWin: number
  raiseWin: number
  dealerQualified: boolean
  playerWon: boolean
}

export function describeDealerHand(cards: Card[]): { label: string; qualifies: boolean } | null {
  if (cards.length !== 5) return null
  const hand = evaluateHand(cards)
  if (!hand) return null
  return { label: hand.label, qualifies: dealerQualifies(cards) }
}

export function calculateOutcome(
  playerCards: Card[],
  dealerCards: Card[],
  ante: number,
  raiseAmount: number,
  action: 'raise' | 'fold',
  progressiveBet: number
): CaribbeanOutcome {
  const totalIn = ante + progressiveBet + (action === 'raise' ? raiseAmount : 0)

  if (action === 'fold') {
    const dealerInfo = describeDealerHand(dealerCards)
    const summary = dealerInfo
      ? `Folded — lost $${ante + progressiveBet} · Dealer: ${dealerInfo.label}${dealerInfo.qualifies ? ' (qualifies)' : ' (no qualify)'}`
      : `Folded — lost $${ante + progressiveBet}`
    return {
      summary,
      netResult: -totalIn,
      anteWin: -ante,
      raiseWin: 0,
      dealerQualified: dealerInfo?.qualifies ?? false,
      playerWon: false,
    }
  }

  const playerHand = evaluateHand(playerCards)!
  const dealerHand = evaluateHand(dealerCards)!
  const qualified = dealerQualifies(dealerCards)

  if (!qualified) {
    const received = ante * 2 + raiseAmount
    const net = received - totalIn
    return {
      summary: `Dealer no qualify (${dealerHand.label}) — won $${ante} on ante, raise pushes (+$${net})`,
      netResult: net,
      anteWin: ante,
      raiseWin: 0,
      dealerQualified: false,
      playerWon: true,
    }
  }

  const result = compareHands(playerHand, dealerHand)
  if (result === 'win') {
    const bonus = anteBonusMultiplier(playerHand)
    const received = ante + ante * bonus + raiseAmount * 2
    const net = received - totalIn
    return {
      summary: `You win! ${playerHand.label} — ante ${bonus}:1 + raise (+$${net})`,
      netResult: net,
      anteWin: ante * bonus,
      raiseWin: raiseAmount,
      dealerQualified: true,
      playerWon: true,
    }
  }
  if (result === 'push') {
    const received = ante + raiseAmount
    const net = received - totalIn
    return {
      summary: `Push — bets returned (${net >= 0 ? '+' : ''}$${net})`,
      netResult: net,
      anteWin: 0,
      raiseWin: 0,
      dealerQualified: true,
      playerWon: false,
    }
  }

  return {
    summary: `Dealer wins (${dealerHand.label}) — lost $${totalIn}`,
    netResult: -totalIn,
    anteWin: -ante,
    raiseWin: -raiseAmount,
    dealerQualified: true,
    playerWon: false,
  }
}

export function formatCardsShort(cards: Card[]): string {
  return cards.map(c => `${formatRankDisplay(c.rank)}${c.suit[0].toUpperCase()}`).join(' ')
}
