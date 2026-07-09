import type { BettingRound } from '../types/poker'

export type StreetStep = 'preflop' | 'flop' | 'turn' | 'river' | 'done'

export function getStreetStep(communityCount: number, holeComplete: boolean): StreetStep {
  if (!holeComplete) return 'preflop'
  if (communityCount < 3) return 'flop'
  if (communityCount < 4) return 'turn'
  if (communityCount < 5) return 'river'
  return 'done'
}

export function streetLabel(step: StreetStep): string {
  const labels: Record<StreetStep, string> = {
    preflop: '1 · Hole cards',
    flop: '2 · Flop',
    turn: '3 · Turn',
    river: '4 · River',
    done: 'Hand complete',
  }
  return labels[step]
}

export function communitySlotEnabled(slotId: string, step: StreetStep): boolean {
  if (step === 'preflop') return false
  if (step === 'flop') return ['c1', 'c2', 'c3'].includes(slotId)
  if (step === 'turn') return slotId === 'c4'
  if (step === 'river') return slotId === 'c5'
  return true
}

export function roundForStep(step: StreetStep): BettingRound {
  if (step === 'flop') return 'flop'
  if (step === 'turn') return 'turn'
  if (step === 'river') return 'river'
  return 'preflop'
}
