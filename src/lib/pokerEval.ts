import type { Card, Rank, Suit } from '../types/poker'

export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']
export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

export const SUIT_COLORS: Record<Suit, string> = {
  hearts: '#e63946',
  diamonds: '#e63946',
  clubs: '#1a1a2e',
  spades: '#1a1a2e',
}

export const RANK_LABELS: Record<Rank, string> = {
  A: 'Ace', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', T: '10', J: 'Jack', Q: 'Queen', K: 'King',
}

export function rankValue(rank: Rank): number {
  if (rank === 'A') return 14
  if (rank === 'K') return 13
  if (rank === 'Q') return 12
  if (rank === 'J') return 11
  if (rank === 'T') return 10
  return parseInt(rank, 10)
}

/** Display rank on cards and in hand summaries (T → 10). */
export function formatRankDisplay(rank: Rank): string {
  return rank === 'T' ? '10' : rank
}

export function formatCardDisplay(card: Card): string {
  return `${formatRankDisplay(card.rank)}${SUIT_SYMBOLS[card.suit]}`
}

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit[0]}`
}

export function parseCard(input: string): Card | null {
  const trimmed = input.trim().toUpperCase()
  const match = trimmed.match(/^([2-9TJQKA]|10)([HDCS♥♦♣♠])$/i)
  if (!match) return null
  const rankStr = match[1] === '10' ? 'T' : match[1].toUpperCase() as Rank
  const suitMap: Record<string, Suit> = {
    H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades',
    '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♠': 'spades',
  }
  const suit = suitMap[match[2].toUpperCase()] ?? suitMap[match[2]]
  if (!RANKS.includes(rankStr as Rank) || !suit) return null
  return { rank: rankStr as Rank, suit }
}

export type HandRank =
  | 'royal_flush' | 'straight_flush' | 'four_kind' | 'full_house'
  | 'flush' | 'straight' | 'three_kind' | 'two_pair' | 'pair' | 'high_card'

export interface EvaluatedHand {
  rank: HandRank
  label: string
  score: number
  tiebreakers: number[]
}

const HAND_LABELS: Record<HandRank, string> = {
  royal_flush: 'Royal Flush',
  straight_flush: 'Straight Flush',
  four_kind: 'Four of a Kind',
  full_house: 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  three_kind: 'Three of a Kind',
  two_pair: 'Two Pair',
  pair: 'Pair',
  high_card: 'High Card',
}

function countRanks(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const c of cards) {
    const v = rankValue(c.rank)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return counts
}

function isFlush(cards: Card[]): boolean {
  if (cards.length < 5) return false
  const suit = cards[0].suit
  return cards.every(c => c.suit === suit)
}

function isStraight(values: number[]): { ok: boolean; high: number } {
  const sorted = [...new Set(values)].sort((a, b) => b - a)
  if (sorted.length < 5) return { ok: false, high: 0 }
  for (let i = 0; i <= sorted.length - 5; i++) {
    const slice = sorted.slice(i, i + 5)
    if (slice[0] - slice[4] === 4) return { ok: true, high: slice[0] }
  }
  // Wheel: A-2-3-4-5
  if (sorted.includes(14) && sorted.includes(5) && sorted.includes(4) &&
      sorted.includes(3) && sorted.includes(2)) {
    return { ok: true, high: 5 }
  }
  return { ok: false, high: 0 }
}

export function evaluateHand(cards: Card[]): EvaluatedHand | null {
  if (cards.length < 5) return null
  const best = evaluateBestFive(cards)
  return best
}

function evaluateBestFive(cards: Card[]): EvaluatedHand {
  if (cards.length === 5) return scoreFive(cards)
  let best: EvaluatedHand | null = null
  const combos = combinations(cards, 5)
  for (const combo of combos) {
    const scored = scoreFive(combo)
    if (!best || scored.score > best.score ||
        (scored.score === best.score && compareTiebreakers(scored.tiebreakers, best.tiebreakers) > 0)) {
      best = scored
    }
  }
  return best!
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c])
  const withoutFirst = combinations(rest, k)
  return [...withFirst, ...withoutFirst]
}

function compareTiebreakers(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  }
  return 0
}

function scoreFive(cards: Card[]): EvaluatedHand {
  const values = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a)
  const counts = countRanks(cards)
  const countEntries = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const flush = isFlush(cards)
  const straight = isStraight(values)

  if (flush && straight) {
    const isRoyal = straight.high === 14 && values.includes(10)
    return {
      rank: isRoyal ? 'royal_flush' : 'straight_flush',
      label: isRoyal ? HAND_LABELS.royal_flush : HAND_LABELS.straight_flush,
      score: isRoyal ? 900 : 800,
      tiebreakers: [straight.high],
    }
  }

  if (countEntries[0][1] === 4) {
    return {
      rank: 'four_kind',
      label: HAND_LABELS.four_kind,
      score: 700,
      tiebreakers: [countEntries[0][0], countEntries[1][0]],
    }
  }

  if (countEntries[0][1] === 3 && countEntries[1][1] === 2) {
    return {
      rank: 'full_house',
      label: HAND_LABELS.full_house,
      score: 600,
      tiebreakers: [countEntries[0][0], countEntries[1][0]],
    }
  }

  if (flush) {
    return {
      rank: 'flush',
      label: HAND_LABELS.flush,
      score: 500,
      tiebreakers: values,
    }
  }

  if (straight.ok) {
    return {
      rank: 'straight',
      label: HAND_LABELS.straight,
      score: 400,
      tiebreakers: [straight.high],
    }
  }

  if (countEntries[0][1] === 3) {
    const kickers = values.filter(v => v !== countEntries[0][0]).slice(0, 2)
    return {
      rank: 'three_kind',
      label: HAND_LABELS.three_kind,
      score: 300,
      tiebreakers: [countEntries[0][0], ...kickers],
    }
  }

  if (countEntries[0][1] === 2 && countEntries[1][1] === 2) {
    const pairs = [countEntries[0][0], countEntries[1][0]].sort((a, b) => b - a)
    const kicker = values.find(v => !pairs.includes(v)) ?? 0
    return {
      rank: 'two_pair',
      label: HAND_LABELS.two_pair,
      score: 200,
      tiebreakers: [...pairs, kicker],
    }
  }

  if (countEntries[0][1] === 2) {
    const pairVal = countEntries[0][0]
    const kickers = values.filter(v => v !== pairVal)
    return {
      rank: 'pair',
      label: `${HAND_LABELS.pair} of ${RANK_LABELS[RANKS.find(r => rankValue(r) === pairVal) ?? 'K']}`,
      score: 100 + pairVal,
      tiebreakers: [pairVal, ...kickers],
    }
  }

  return {
    rank: 'high_card',
    label: `${HAND_LABELS.high_card} (${RANK_LABELS[cards[0].rank]})`,
    score: values[0],
    tiebreakers: values,
  }
}

export function evaluateThreeCard(cards: Card[]): { label: string; score: number } {
  if (cards.length !== 3) return { label: 'Incomplete', score: 0 }
  const values = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a)
  const counts = countRanks(cards)
  const countEntries = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const flush = isFlush(cards)
  const straight = isStraight(values)

  if (straight.ok && flush) return { label: 'Straight Flush', score: 600 + straight.high }
  if (countEntries[0][1] === 3) return { label: 'Three of a Kind', score: 500 + countEntries[0][0] }
  if (straight.ok) return { label: 'Straight', score: 400 + straight.high }
  if (flush) return { label: 'Flush', score: 300 + values[0] }
  if (countEntries[0][1] === 2) return { label: 'Pair', score: 200 + countEntries[0][0] }
  return { label: `High Card (${RANK_LABELS[cards[0].rank]})`, score: values[0] }
}

import { shouldCaribbeanRaise } from './caribbeanFlow'

export function meetsCaribbeanRaiseThreshold(cards: Card[], dealerUp?: Card | null): boolean {
  return shouldCaribbeanRaise(cards, dealerUp)
}

export function meetsThreeCardPlayThreshold(cards: Card[]): boolean {
  if (cards.length !== 3) return false
  const values = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a)
  const counts = countRanks(cards)
  if ([...counts.values()].some(v => v >= 2)) return true
  // Q-6-4 rule
  const [high, mid, low] = values
  if (high > 12) return true // better than Queen high
  if (high < 12) return false // worse than Queen
  if (high === 12) {
    if (mid > 6) return true
    if (mid < 6) return false
    return low >= 4
  }
  return false
}
