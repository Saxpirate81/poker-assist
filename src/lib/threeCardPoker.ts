import type { Card } from '../types/poker'
import { evaluateThreeCard, rankValue, meetsThreeCardPlayThreshold } from './pokerEval'
import { formatMoneyWithSymbol } from './money'

export function dealerQualifiesThreeCard(cards: Card[]): boolean {
  if (cards.length !== 3) return false
  const eval3 = evaluateThreeCard(cards)
  if (eval3.score >= 200) return true
  const high = Math.max(...cards.map(c => rankValue(c.rank)))
  return high >= 12
}

function highCardTiebreak(cards: Card[]): number[] {
  return cards.map(c => rankValue(c.rank)).sort((a, b) => b - a)
}

export function compareThreeCardHands(player: Card[], dealer: Card[]): 'win' | 'lose' | 'push' {
  const p = evaluateThreeCard(player)
  const d = evaluateThreeCard(dealer)
  if (p.score !== d.score) return p.score > d.score ? 'win' : 'lose'
  const pVals = highCardTiebreak(player)
  const dVals = highCardTiebreak(dealer)
  for (let i = 0; i < 3; i++) {
    if ((pVals[i] ?? 0) !== (dVals[i] ?? 0)) {
      return (pVals[i] ?? 0) > (dVals[i] ?? 0) ? 'win' : 'lose'
    }
  }
  return 'push'
}

const PAIR_PLUS: { minScore: number; mult: number; label: string }[] = [
  { minScore: 600, mult: 40, label: 'Straight Flush' },
  { minScore: 500, mult: 30, label: 'Three of a Kind' },
  { minScore: 400, mult: 6, label: 'Straight' },
  { minScore: 300, mult: 3, label: 'Flush' },
  { minScore: 200, mult: 1, label: 'Pair' },
]

export function pairPlusMultiplier(cards: Card[]): number {
  if (cards.length !== 3) return 0
  const score = evaluateThreeCard(cards).score
  for (const row of PAIR_PLUS) {
    if (score >= row.minScore) return row.mult
  }
  return 0
}

export interface ThreeCardOutcome {
  summary: string
  netResult: number
  playerWon: boolean
  valid: boolean
}

export function calculateThreeCardOutcome(
  playerCards: Card[],
  dealerCards: Card[],
  ante: number,
  playAmt: number,
  action: 'play' | 'fold',
  pairPlusBet: number
): ThreeCardOutcome {
  const fmt = (n: number) => formatMoneyWithSymbol(n)
  const pairPlusMult = pairPlusBet > 0 ? pairPlusMultiplier(playerCards) : 0
  const pairPlusWin = pairPlusBet * pairPlusMult

  if (action === 'fold') {
    const net = -(ante + pairPlusBet) + pairPlusWin
    return {
      summary: pairPlusWin > 0
        ? `Folded — lost ante ${fmt(ante)}, Pair Plus +${fmt(pairPlusWin)}`
        : `Folded — lost ${fmt(ante + pairPlusBet)}`,
      netResult: net,
      playerWon: false,
      valid: true,
    }
  }

  if (playerCards.length !== 3 || dealerCards.length !== 3) {
    return { summary: 'Need full player and dealer hands', netResult: 0, playerWon: false, valid: false }
  }

  const totalIn = ante + playAmt + pairPlusBet
  const qualified = dealerQualifiesThreeCard(dealerCards)
  const playerEval = evaluateThreeCard(playerCards)
  const dealerEval = evaluateThreeCard(dealerCards)

  if (!qualified) {
    const net = ante + playAmt + pairPlusWin - totalIn
    return {
      summary: `Dealer no qualify (${dealerEval.label}) — won ${fmt(ante)} ante, play pushes (+${fmt(net)})`,
      netResult: net,
      playerWon: true,
      valid: true,
    }
  }

  const result = compareThreeCardHands(playerCards, dealerCards)
  if (result === 'win') {
    const net = ante + playAmt + pairPlusWin - totalIn
    return {
      summary: `You win! ${playerEval.label} beats ${dealerEval.label} (+${fmt(net)})`,
      netResult: net,
      playerWon: true,
      valid: true,
    }
  }
  if (result === 'push') {
    const net = pairPlusWin - pairPlusBet
    return {
      summary: `Push — ${playerEval.label} vs ${dealerEval.label}`,
      netResult: net,
      playerWon: false,
      valid: true,
    }
  }

  return {
    summary: `Dealer wins (${dealerEval.label}) — lost ${fmt(totalIn - pairPlusWin)}`,
    netResult: -(totalIn - pairPlusWin),
    playerWon: false,
    valid: true,
  }
}

export { meetsThreeCardPlayThreshold }
