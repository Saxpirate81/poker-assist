import type { AiAdvice, BettingRound, Card, GameRuleSetting, HandState } from '../types/poker'
import type { PokerGame } from '../types/poker'
import {
  evaluateHand,
  evaluateThreeCard,
  meetsThreeCardPlayThreshold,
  rankValue,
} from './pokerEval'
import {
  getCommunityCards,
  getPlayerCards,
  hasEnoughCardsForAdvice,
  isPlayerHandComplete,
  ruleValue,
} from './handUtils'
import { getRaiseReason, shouldCaribbeanRaise } from './caribbeanFlow'
import { formatMoneyWithSymbol } from './money'
import { getAiProvider, getOpenAiApiKey, setOpenAiApiKey } from './config'
import { buildCaribbeanPrompt, getGeminiAdvice, recognizeCardsFromPhotoGemini, type PhotoReadContext, type PhotoReadOptions } from './geminiService'
import { parseVisionResponse } from './photoCardMapping'

export function getApiKey(): string {
  return getOpenAiApiKey()
}

export function setApiKey(key: string): void {
  setOpenAiApiKey(key)
}

export function getRuleBasedAdvice(
  game: PokerGame,
  state: HandState,
  rules: GameRuleSetting[]
): AiAdvice {
  const playerCards = getPlayerCards(state, game)
  const community = getCommunityCards(state, game)
  const round = state.currentRound
  const handComplete = isPlayerHandComplete(state, game)
  const ready = hasEnoughCardsForAdvice(state, game)

  if (!ready && playerCards.length === 0) {
    return {
      verdict: 'neutral',
      headline: 'Log your cards to start',
      detail: 'Tap a card slot or snap a photo — I\'ll tell you the optimal bet instantly.',
      recommendedAction: 'Add cards',
      confidence: 0.95,
    }
  }

  if (game.id === 'caribbean-stud') {
    const dealerUp = state.cards['d1'] ?? null
    return caribbeanAdvice(playerCards, round, rules, handComplete, dealerUp)
  }
  if (game.id === 'three-card-poker') {
    return threeCardAdvice(playerCards, round, rules, handComplete)
  }
  if (game.id === 'video-poker') {
    return videoPokerAdvice(playerCards, rules, handComplete)
  }
  if (game.id === 'texas-holdem' || game.id === 'omaha') {
    return holdemAdvice(playerCards, community, round, rules, game.id, ready)
  }

  return {
    verdict: 'neutral',
    headline: 'Keep logging cards',
    detail: 'Enter your cards and I\'ll analyze your best move.',
    recommendedAction: 'Complete your hand first',
    confidence: 0.5,
  }
}

function caribbeanAdvice(
  cards: Card[],
  _round: BettingRound,
  rules: GameRuleSetting[],
  handComplete: boolean,
  dealerUp: Card | null
): AiAdvice {
  const ante = Number(ruleValue(rules, 'ante'))
  const raiseMult = Number(ruleValue(rules, 'raiseMultiplier'))
  const raiseAmt = ante * raiseMult

  if (!dealerUp) {
    return {
      verdict: 'neutral',
      headline: 'Enter dealer up-card first',
      detail: 'Tap the first dealer slot. Strategy uses the up-card to recommend raise or fold.',
      recommendedAction: 'Log dealer up-card',
      confidence: 0.95,
    }
  }

  if (!handComplete) {
    return {
      verdict: 'neutral',
      headline: `${5 - cards.length} card(s) to go`,
      detail: `Dealer shows ${dealerUp.rank}${dealerUp.suit[0]}. Ante ${formatMoneyWithSymbol(ante)} — coach ready at 5 cards.`,
      recommendedAction: `Ante ${formatMoneyWithSymbol(ante)}`,
      confidence: 0.9,
    }
  }

  const hand = evaluateHand(cards)
  const shouldRaise = shouldCaribbeanRaise(cards, dealerUp)
  const reason = getRaiseReason(cards, hand, dealerUp)

  if (shouldRaise) {
    return {
      verdict: 'good',
      headline: `MAX BET — Raise ${formatMoneyWithSymbol(raiseAmt)}`,
      detail: reason
        ? `${hand?.label ?? 'Playable'}. ${reason}. Always raise full ${raiseMult}× (${formatMoneyWithSymbol(raiseAmt)}) — never less.`
        : `${hand?.label ?? 'Playable'}. Raise the full ${raiseMult}× ante to maximize value.`,
      recommendedAction: `Raise ${formatMoneyWithSymbol(raiseAmt)}`,
      betAmount: raiseAmt,
      urgent: true,
      confidence: hand!.score >= 200 ? 0.95 : 0.84,
    }
  }

  return {
    verdict: 'bad',
    headline: 'FOLD — save your raise',
    detail: `${hand?.label ?? 'High card'} — below raise threshold (need pair, or Ace with J+). Save ${formatMoneyWithSymbol(raiseAmt)}.`,
    recommendedAction: 'Fold',
    betAmount: 0,
    urgent: true,
    confidence: 0.92,
  }
}

function threeCardAdvice(
  cards: Card[],
  _round: BettingRound,
  rules: GameRuleSetting[],
  handComplete: boolean
): AiAdvice {
  const ante = Number(ruleValue(rules, 'ante'))
  const playMult = Number(ruleValue(rules, 'playMultiplier'))
  const playAmt = ante * playMult

  if (!handComplete) {
    return {
      verdict: 'neutral',
      headline: `${3 - cards.length} card(s) to go`,
      detail: `Ante $${ante}. I'll call play ($${playAmt}) or fold as soon as all 3 cards are in.`,
      recommendedAction: `Ante ${formatMoneyWithSymbol(ante)}`,
      confidence: 0.9,
    }
  }

  const eval3 = evaluateThreeCard(cards)
  const shouldPlay = meetsThreeCardPlayThreshold(cards)

  if (shouldPlay) {
    return {
      verdict: 'good',
      headline: `MAX BET — Play $${playAmt}`,
      detail: `${eval3.label} beats Q-6-4. Play the full ${playMult}× ante to maximize payout.`,
      recommendedAction: `Play $${playAmt}`,
      betAmount: playAmt,
      urgent: true,
      confidence: 0.93,
    }
  }

  return {
    verdict: 'bad',
    headline: 'FOLD — lose ante only',
    detail: `${eval3.label} is below Q-6-4. Save the $${playAmt} play bet.`,
    recommendedAction: 'Fold',
    betAmount: 0,
    urgent: true,
    confidence: 0.9,
  }
}

function videoPokerAdvice(cards: Card[], rules: GameRuleSetting[], handComplete: boolean): AiAdvice {
  const bet = Number(ruleValue(rules, 'bet'))

  if (!handComplete) {
    return {
      verdict: 'neutral',
      headline: `${5 - cards.length} card(s) to go`,
      detail: `Bet $${bet} per hand. I'll tell you exactly which cards to hold once all 5 are logged.`,
      recommendedAction: `Bet $${bet}`,
      confidence: 0.85,
    }
  }

  const hand = evaluateHand(cards)
  if (hand && hand.score >= 111) {
    return {
      verdict: 'good',
      headline: `Hold all — ${hand.label}`,
      detail: 'Paying hand! Hold all five. Bet max coins when possible for full payout.',
      recommendedAction: 'Hold all 5',
      betAmount: bet,
      urgent: true,
      confidence: 0.96,
    }
  }

  const values = cards.map(c => rankValue(c.rank))
  const counts = new Map<number, number>()
  values.forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1))
  const pairs = [...counts.entries()].filter(([, n]) => n >= 2)

  if (pairs.some(([v]) => v >= 11)) {
    return {
      verdict: 'good',
      headline: 'Hold the pair, redraw rest',
      detail: 'Keep your Jacks-or-better pair. Discard everything else for max EV.',
      recommendedAction: 'Hold pair only',
      betAmount: bet,
      urgent: true,
      confidence: 0.9,
    }
  }

  return {
    verdict: 'warning',
    headline: 'Redraw — no paying hand',
    detail: 'Hold high cards (J+) or 4-to-flush/straight. One more draw at max bet.',
    recommendedAction: 'Discard & draw',
    betAmount: bet,
    urgent: true,
    confidence: 0.78,
  }
}

function holdemAdvice(
  hole: Card[],
  community: Card[],
  round: BettingRound,
  rules: GameRuleSetting[],
  gameId: string,
  ready: boolean
): AiAdvice {
  const bb = Number(ruleValue(rules, 'bigBlind'))
  const requiredHole = gameId === 'omaha' ? 4 : 2

  if (hole.length < requiredHole) {
    return {
      verdict: 'neutral',
      headline: `${requiredHole - hole.length} hole card(s) left`,
      detail: 'Log your hole cards — pre-flop advice fires instantly.',
      recommendedAction: 'Tap hole cards',
      confidence: 0.85,
    }
  }

  const holeValues = hole.map(c => rankValue(c.rank)).sort((a, b) => b - a)
  const isPair = holeValues[0] === holeValues[1]
  const isSuited = hole.every(c => c.suit === hole[0].suit)
  const highCard = Math.max(...holeValues)

  if (round === 'preflop' && community.length === 0 && ready) {
    if (isPair && holeValues[0] >= 10) {
      const betAmt = bb * 4
      return {
        verdict: 'good',
        headline: `Raise to $${betAmt} for value`,
        detail: `Pocket ${hole[0].rank}s — 3-bet/raise to build the pot and maximize value.`,
        recommendedAction: `Raise $${betAmt}`,
        betAmount: betAmt,
        urgent: true,
        confidence: 0.9,
      }
    }
    if (highCard >= 14 && holeValues[1] >= 11) {
      const betAmt = Math.round(bb * 3)
      return {
        verdict: 'good',
        headline: `Open raise $${betAmt}`,
        detail: 'Premium Broadway — raise for value from most positions.',
        recommendedAction: `Raise $${betAmt}`,
        betAmount: betAmt,
        urgent: true,
        confidence: 0.85,
      }
    }
    if (highCard >= 12 && isSuited) {
      return {
        verdict: 'neutral',
        headline: 'Suited — call or raise small',
        detail: 'Playable in position. Call $' + bb + '-' + bb * 2 + ' or open to $' + bb * 3 + '.',
        recommendedAction: `Call $${bb}`,
        betAmount: bb,
        confidence: 0.72,
      }
    }
    return {
      verdict: 'bad',
      headline: 'Fold pre-flop',
      detail: 'Weak hand — save chips. Fold to any raise.',
      recommendedAction: 'Fold',
      betAmount: 0,
      urgent: true,
      confidence: 0.8,
    }
  }

  const allCards = [...hole, ...community]
  if (community.length >= 3 && allCards.length >= 5 && ready) {
    const best = evaluateHand(allCards)
    const potBet = bb * Math.max(2, community.length)

    if (best && best.score >= 200) {
      return {
        verdict: 'good',
        headline: `${best.label} — bet $${potBet}`,
        detail: 'Strong made hand. Bet for value to maximize what worse hands will pay.',
        recommendedAction: `Bet $${potBet}`,
        betAmount: potBet,
        urgent: true,
        confidence: 0.88,
      }
    }
    if (best && best.score >= 100) {
      return {
        verdict: 'neutral',
        headline: `${best.label} — pot control`,
        detail: 'Medium strength. Check-call up to $' + bb * 2 + ', fold to big raises.',
        recommendedAction: `Call up to $${bb * 2}`,
        betAmount: bb,
        confidence: 0.75,
      }
    }
  }

  if (!ready) {
    const needed = round === 'flop' ? 3 : round === 'turn' ? 4 : round === 'river' ? 5 : 0
    const have = community.length
    if (needed > have) {
      return {
        verdict: 'neutral',
        headline: `Log ${needed - have} more community card(s)`,
        detail: `${round} advice fires as soon as cards are logged.`,
        recommendedAction: 'Tap community cards',
        confidence: 0.85,
      }
    }
  }

  const roundLabels: Record<BettingRound, string> = {
    preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River',
    ante: 'Ante', raise: 'Raise', play: 'Play', fold: 'Fold',
  }

  return {
    verdict: 'warning',
    headline: `${roundLabels[round] ?? round} — check/fold`,
    detail: 'Weak on this board. Do not put more money in without a strong draw.',
    recommendedAction: 'Check or fold',
    betAmount: 0,
    confidence: 0.7,
  }
}

export async function getAiAdvice(
  game: PokerGame,
  state: HandState,
  rules: GameRuleSetting[]
): Promise<AiAdvice & { provider?: string }> {
  const baseline = getRuleBasedAdvice(game, state, rules)
  const provider = getAiProvider()

  if (game.id === 'caribbean-stud' && provider === 'gemini') {
    const playerCards = getPlayerCards(state, game)
    const dealerUp = state.cards['d1'] ?? null
    const ante = Number(ruleValue(rules, 'ante'))
    const raiseMult = Number(ruleValue(rules, 'raiseMultiplier'))
    const raiseAmt = ante * raiseMult

    if (dealerUp && playerCards.length === 5) {
      const prompt = buildCaribbeanPrompt({
        playerCards: playerCards.map(c => `${c.rank}${c.suit[0]}`).join(', '),
        dealerUp: `${dealerUp.rank}${dealerUp.suit[0]}`,
        ante,
        raiseAmt,
        raiseMult,
      })
      const gemini = await getGeminiAdvice(prompt)
      if (gemini) return { ...baseline, ...gemini, provider: 'gemini' }
    }
  }

  if (provider === 'openai') {
    const apiKey = getOpenAiApiKey()
    if (apiKey) {
      try {
        const playerCards = getPlayerCards(state, game)
        const community = getCommunityCards(state, game)
        const dealerUp = state.cards['d1']
        const prompt = `You are an expert poker coach. Game: ${game.name}. Round: ${state.currentRound}.
Player cards: ${playerCards.map(c => `${c.rank}${c.suit[0]}`).join(', ') || 'none'}
Dealer up-card: ${dealerUp ? `${dealerUp.rank}${dealerUp.suit[0]}` : 'none'}
Community: ${community.map(c => `${c.rank}${c.suit[0]}`).join(', ') || 'none'}
Rules: ${JSON.stringify(rules.map(r => ({ [r.id]: r.value })))}

Respond ONLY with JSON: {"verdict":"good|bad|neutral|warning","headline":"short","detail":"1-2 sentences","recommendedAction":"Raise $X or Fold","betAmount":number_or_0,"confidence":0.0-1.0,"urgent":true}`

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const content = data.choices?.[0]?.message?.content ?? ''
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as AiAdvice
            return { ...baseline, ...parsed, provider: 'openai' }
          }
        }
      } catch { /* fall through */ }
    }
  }

  return { ...baseline, provider: 'rules' }
}

export async function recognizeCardsFromPhoto(
  imageBase64: string,
  expectedCount: number,
  context: PhotoReadContext = 'player-hand',
  options?: PhotoReadOptions
): Promise<{ cards: Card[]; parsed: ReturnType<typeof parseVisionResponse>; error?: string }> {
  const gemini = await recognizeCardsFromPhotoGemini(imageBase64, expectedCount, context, options)
  if (gemini.cards.length > 0) return gemini
  if (gemini.error && !getOpenAiApiKey()) return gemini

  const apiKey = getOpenAiApiKey()
  if (!apiKey) {
    return {
      cards: [],
      parsed: { dealerUp: null, playerCards: [], dealerHoleCards: [], flat: [] },
      error: gemini.error ?? 'Add Gemini or OpenAI API key in Settings for photo read.',
    }
  }

  const emptyParsed = { dealerUp: null, playerCards: [], dealerHoleCards: [] as Card[], flat: [] as Card[] }

  try {
    const promptText = context === 'table'
      ? `Caribbean Stud table photo. Return JSON: {"dealerUp":{"rank","suit"}|null,"playerCards":[5 cards left-to-right]}. Use T for ten. Include ALL 5 player cards.`
      : context === 'dealer-rest'
        ? `Caribbean Stud showdown. Return JSON: {"dealerUp":{"rank","suit"},"dealerHoleCards":[exactly 4 hole cards, NOT the up-card]}. Use T for ten.`
        : context === 'player-hand'
        ? `Find ${expectedCount} PLAYER cards only (not dealer), left to right. Return JSON array of ${expectedCount} cards. Use T for ten.`
        : `Identify ~${expectedCount} playing cards left-to-right. Return ONLY JSON array [{"rank","suit"}]. Use T for ten.`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        }],
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      return { cards: [], parsed: emptyParsed, error: `Vision API error: ${res.status}` }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    const parsed = parseVisionResponse(content, context)
    if (parsed.flat.length === 0) {
      return { cards: [], parsed, error: 'Could not parse cards from photo.' }
    }
    return { cards: parsed.flat, parsed }
  } catch (e) {
    return { cards: [], parsed: emptyParsed, error: e instanceof Error ? e.message : 'Recognition failed' }
  }
}
