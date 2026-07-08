export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K'

export interface Card {
  rank: Rank
  suit: Suit
}

export type BettingRound =
  | 'ante'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'raise'
  | 'play'
  | 'fold'

export type AdviceVerdict = 'good' | 'bad' | 'neutral' | 'warning'

export interface AiAdvice {
  verdict: AdviceVerdict
  headline: string
  detail: string
  recommendedAction: string
  confidence: number
  betAmount?: number
  urgent?: boolean
}

export interface GameRuleSetting {
  id: string
  label: string
  type: 'number' | 'boolean' | 'select'
  value: number | boolean | string
  options?: { label: string; value: string }[]
  min?: number
  max?: number
  step?: number
  description?: string
}

export interface CardSlot {
  id: string
  label: string
  group: 'player' | 'dealer' | 'community' | 'shared'
  hidden?: boolean
}

export interface PokerGame {
  id: string
  name: string
  emoji: string
  description: string
  playerSlots: CardSlot[]
  dealerSlots?: CardSlot[]
  communitySlots?: CardSlot[]
  bettingRounds: BettingRound[]
  defaultRules: GameRuleSetting[]
  rulesSummary: string[]
  strategyTips: string[]
}

export interface HandState {
  gameId: string
  cards: Record<string, Card | null>
  currentRound: BettingRound
  roundIndex: number
  pot: number
  playerBet: number
  dealerBet: number
  bankroll: number
  history: { round: BettingRound; action: string; amount?: number }[]
}
