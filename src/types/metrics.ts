import type { HandTrends } from '../types/handLog'

export interface ExtendedHandTrends extends HandTrends {
  foldRate: number
  raiseRate: number
  raiseWinRate: number
  avgRaiseAmount: number
  totalWagered: number
  roiPercent: number
  sessionBankroll: number
  /** User-set starting stack (not default $500). */
  startingBankroll?: number
  actualBankroll?: number | null
  sessionBankrollLocal?: number
  aiFollowWinRate: number
  aiIgnoreWinRate: number
  bestWin: number
  worstLoss: number
  longestWinStreak: number
  longestLossStreak: number
  /** Oldest-first cumulative P&L for chart */
  cumulativePnL: number[]
  /** Per-hand P&L oldest-first */
  allPnL: number[]
  byDay: { date: string; hands: number; pnl: number }[]
}

export interface MetricRecommendation {
  id: string
  category: 'betting' | 'strategy' | 'discipline' | 'bankroll'
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  settingId?: string
  suggestedValue?: number | boolean | string
  metricBasis?: string
}

export interface GameMetricsAdjustments {
  gameId: string
  updatedAt: number
  acceptedIds: string[]
  dismissedIds: string[]
  userOverrides: Record<string, number | boolean | string>
  notes: string
}

export interface GameSessionMetrics {
  gameId: string
  handsPlayed: number
  wins: number
  losses: number
  folds: number
  plays: number
  netPnL: number
  bankroll: number
  winRate: number
  foldRate: number
  playRate: number
}

export interface GameMetricsBundle {
  gameId: string
  gameName: string
  emoji: string
  session: GameSessionMetrics
  extended: ExtendedHandTrends | null
  handCount: number
}
