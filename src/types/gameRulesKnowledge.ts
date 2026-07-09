/** Casino-specific rules knowledge — updatable via photo, remote sync, or manual edit. */
export interface GameRulesKnowledge {
  gameId: string
  updatedAt: number
  source: 'default' | 'photo' | 'remote' | 'manual'
  /** How-to-play bullets shown in UI */
  rulesSummary: string[]
  /** Strategy hints for player + AI coach */
  strategyTips: string[]
  /** Extra context for AI (pay table quirks, house rules, side bets) */
  aiCoachNotes: string[]
  /** Overrides for tweakable GameRuleSetting values */
  settingOverrides: Record<string, number | boolean | string>
  /** Free-text dealer qualification rule from table sign */
  dealerQualifyRule?: string
  /** Pay table / payout notes as read from photo */
  payTableNotes?: string
  /** Raw AI extraction summary (for debugging / review) */
  photoExtractSummary?: string
}

export interface ParsedRulesFromPhoto {
  rulesSummary: string[]
  strategyTips: string[]
  aiCoachNotes: string[]
  settingOverrides: Record<string, number | boolean | string>
  dealerQualifyRule?: string
  payTableNotes?: string
  confidence: number
  extractSummary: string
}
