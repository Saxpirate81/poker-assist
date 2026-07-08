import type { Card } from '../types/poker'
import type { EvaluatedHand } from './pokerEval'
import { evaluateHand } from './pokerEval'
import { shouldCaribbeanRaise } from './caribbeanFlow'

export interface CaribbeanBetAnalysis {
  winPct: number
  losePct: number
  pushPct: number
  dealerNoQualPct: number
  foldEv: number
  raiseEv: number
  recommend: 'raise' | 'fold'
  confidence: number
  reason: string
  handLabel: string
}

const DEALER_NO_QUAL = 0.31
const DEALER_QUAL = 0.69

function winRateWhenQualified(hand: EvaluatedHand): number {
  if (hand.score >= 800) return 0.92
  if (hand.score >= 600) return 0.84
  if (hand.score >= 400) return 0.74
  if (hand.score >= 300) return 0.62
  if (hand.score >= 200) return 0.54
  return 0.38
}

function avgWinAmount(ante: number, raiseAmt: number, progressive: number, hand: EvaluatedHand): number {
  const bonus = hand.score >= 200 ? (hand.score >= 400 ? 3 : 1.5) : 1
  const noQualWin = ante + progressive
  const qualWin = ante * bonus + raiseAmt + progressive * 0.5
  return DEALER_NO_QUAL * noQualWin + DEALER_QUAL * qualWin
}

function avgLossAmount(ante: number, raiseAmt: number, progressive: number): number {
  return ante + raiseAmt + progressive
}

export function analyzeCaribbeanBet(
  playerCards: Card[],
  dealerUp: Card | null,
  ante: number,
  raiseAmt: number,
  progressive: number
): CaribbeanBetAnalysis | null {
  if (playerCards.length !== 5 || !dealerUp) return null

  const hand = evaluateHand(playerCards)
  if (!hand) return null

  const raise = shouldCaribbeanRaise(playerCards, dealerUp)
  const winWhenQual = winRateWhenQualified(hand)
  const pushWhenQual = hand.score >= 200 ? 0.02 : 0.01

  const winPct = Math.round((DEALER_NO_QUAL + DEALER_QUAL * winWhenQual) * 100)
  const pushPct = Math.round(DEALER_QUAL * pushWhenQual * 100)
  const losePct = Math.max(0, 100 - winPct - pushPct)

  const foldEv = -(ante + progressive)
  const raiseEv =
    (winPct / 100) * avgWinAmount(ante, raiseAmt, progressive, hand) -
    (losePct / 100) * avgLossAmount(ante, raiseAmt, progressive) +
    (pushPct / 100) * 0

  const evDiff = raiseEv - foldEv
  const confidence = raise
    ? Math.min(0.97, 0.72 + hand.score / 2000 + (evDiff > 0 ? 0.08 : 0))
    : Math.min(0.94, 0.78 + Math.abs(evDiff) / (ante + raiseAmt + 1))

  let reason = ''
  if (hand.score >= 200) reason = `${hand.label} — standard raise`
  else if (raise) reason = 'Ace-high / matches dealer up-card'
  else reason = 'Below raise threshold — save raise'

  return {
    winPct,
    losePct,
    pushPct,
    dealerNoQualPct: Math.round(DEALER_NO_QUAL * 100),
    foldEv,
    raiseEv,
    recommend: raise ? 'raise' : 'fold',
    confidence,
    reason,
    handLabel: hand.label,
  }
}
