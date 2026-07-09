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
  /** e.g. "3W", "2L", "1F" */
  currentStreak: string
  dealerQualifyRate: number
  todayHands: number
  todayPnL: number
  /** Last 10 hands, oldest first (for sparkline) */
  recentPnL: number[]
  followAiPnL: number
  ignoreAiPnL: number
  /** Dealer outcomes at showdown (raise + full dealer hand). */
  dealer: DealerStats
}

export interface DealerStats {
  showdownHands: number
  qualifyCount: number
  noQualifyCount: number
  qualifyRate: number
  noQualifyRate: number
  playerWinsWhenQual: number
  playerLossesWhenQual: number
  pushesWhenQual: number
  /** You win among qualified showdowns (excl. pushes). Pairs with dealerWinRateWhenQual → 100%. */
  playerWinRateWhenQual: number
  /** Dealer wins among qualified showdowns (excl. pushes). Pairs with playerWinRateWhenQual → 100%. */
  dealerWinRateWhenQual: number
  /** Pushes among qualified showdowns. player + dealer + push = 100% of qual showdowns. */
  pushRateWhenQual: number
  /** Player wins when dealer did not qualify. */
  winsFromNoQual: number
  currentQualifyStreak: string
  currentNoQualStreak: string
  currentDealerWinStreak: string
  longestQualifyStreak: number
  longestNoQualStreak: number
  longestDealerWinStreak: number
  /** Last 10 showdowns, newest first: Q/N/W/L/T */
  recentShowdownStreak: string
}

export interface BetOutcomeSlice {
  id: string
  label: string
  count: number
  /** % of raises that went to showdown with full dealer hand */
  pctOfShowdowns: number
  /** % of all raises */
  pctOfRaises: number
  color: string
}

export interface BetOutcomeBreakdown {
  totalRaises: number
  showdownHands: number
  slices: BetOutcomeSlice[]
}

export type HandOutcomeType =
  | 'fold'
  | 'dealer-no-qual'
  | 'you-win-showdown'
  | 'dealer-win-showdown'
  | 'push'
  | 'incomplete'

export interface OutcomeTimelineEvent {
  handNum: number
  handId: string
  createdAt: string
  outcomeType: HandOutcomeType
  filterId: string
  label: string
  shortLabel: string
  color: string
  netResult: number
  playerHand: string
  action: 'raise' | 'fold'
  outcomeSummary: string
}

/** Per-hand strength comparison (oldest → newest numbering). */
export interface HandStrengthPoint {
  handNum: number
  handId: string
  createdAt: string
  action: 'raise' | 'fold'
  playerScore: number
  playerLabel: string
  dealerScore: number | null
  dealerLabel: string | null
  /** Dealer had all 5 cards logged */
  dealerComplete: boolean
  stronger: 'player' | 'dealer' | 'tie' | 'unknown'
  netResult: number
}

/** Timeline block — default 10 hands per set. */
export interface HandStrengthBlock {
  blockIndex: number
  startHand: number
  endHand: number
  hands: HandStrengthPoint[]
  avgPlayerScore: number
  avgDealerScore: number | null
  playerStrongerCount: number
  dealerStrongerCount: number
  tieCount: number
  unknownCount: number
  blockPnL: number
  dateStart: string
  dateEnd: string
}
