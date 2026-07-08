import type { AiAdvice, Card } from '../types/poker'

export interface LoggedCaribbeanHand {
  id: string
  createdAt: string
  deviceId: string
  dealerUpCard: Card | null
  playerCards: Card[]
  dealerCards: Card[]
  playerHand: string
  dealerHand: string
  ante: number
  raiseMultiplier: number
  raiseAmount: number
  progressiveBet: number
  action: 'raise' | 'fold'
  aiAdvice: AiAdvice | null
  aiProvider: string
  followedAi: boolean
  netResult: number
  outcomeSummary: string
  dealerQualified: boolean
  playerWon: boolean
}

export interface HandTrends {
  totalHands: number
  wins: number
  losses: number
  folds: number
  raises: number
  totalPnL: number
  aiFollowRate: number
  avgAnte: number
  winRate: number
  recentStreak: string
}
