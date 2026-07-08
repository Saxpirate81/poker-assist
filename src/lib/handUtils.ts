import type { Card, GameRuleSetting, HandState } from '../types/poker'
import type { PokerGame } from '../types/poker'
import { clampAnte } from './money'

export function cardsFingerprint(cards: Record<string, Card | null>): string {
  return Object.entries(cards)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, c]) => (c ? `${id}:${c.rank}${c.suit[0]}` : `${id}:`))
    .join('|')
}

export function getPlayerCards(state: HandState, game: PokerGame): Card[] {
  return game.playerSlots
    .map(s => state.cards[s.id])
    .filter((c): c is Card => c !== null && c !== undefined)
}

export function getCommunityCards(state: HandState, game: PokerGame): Card[] {
  return (game.communitySlots ?? [])
    .map(s => state.cards[s.id])
    .filter((c): c is Card => c !== null && c !== undefined)
}

export function isPlayerHandComplete(state: HandState, game: PokerGame): boolean {
  return game.playerSlots.every(s => state.cards[s.id] !== null)
}

export function cardsNeededForAdvice(state: HandState, game: PokerGame): number {
  const round = state.currentRound
  if (game.id === 'texas-holdem' || game.id === 'omaha') {
    const holeNeeded = game.id === 'omaha' ? 4 : 2
    if (round === 'preflop') return holeNeeded
    if (round === 'flop') return holeNeeded + 3
    if (round === 'turn') return holeNeeded + 4
    if (round === 'river') return holeNeeded + 5
    return holeNeeded
  }
  return game.playerSlots.length
}

export function hasEnoughCardsForAdvice(state: HandState, game: PokerGame): boolean {
  const player = getPlayerCards(state, game)
  const community = getCommunityCards(state, game)
  const needed = cardsNeededForAdvice(state, game)

  if (game.communitySlots?.length) {
    return player.length + community.length >= needed
  }
  return player.length >= needed
}

export function getDecisionRound(game: PokerGame): HandState['currentRound'] {
  const decisionRounds: HandState['currentRound'][] = ['raise', 'play']
  for (const r of game.bettingRounds) {
    if (decisionRounds.includes(r)) return r
  }
  return game.bettingRounds[game.bettingRounds.length - 1]
}

export function ruleValue(rules: GameRuleSetting[], id: string): number | boolean | string {
  return rules.find(r => r.id === id)?.value ?? 0
}

export function getPrimaryBetRule(rules: GameRuleSetting[]): GameRuleSetting | undefined {
  return rules.find(r => r.id === 'ante' || r.id === 'bigBlind' || r.id === 'bet')
}

export function getSuggestedBetAmount(
  _game: PokerGame,
  rules: GameRuleSetting[],
  action: 'ante' | 'raise' | 'play' | 'bet'
): number {
  const ante = Number(ruleValue(rules, 'ante'))
  const bb = Number(ruleValue(rules, 'bigBlind'))
  const bet = Number(ruleValue(rules, 'bet'))
  const raiseMult = Number(ruleValue(rules, 'raiseMultiplier'))
  const playMult = Number(ruleValue(rules, 'playMultiplier'))

  if (action === 'ante') return clampAnte(ante || bet || bb)
  if (action === 'raise') return clampAnte((ante || bb) * raiseMult)
  if (action === 'play') return clampAnte(ante * playMult)
  return clampAnte(bet || bb || ante)
}
