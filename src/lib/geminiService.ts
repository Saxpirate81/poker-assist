import type { AiAdvice, Card } from '../types/poker'
import { getGeminiApiKey } from './config'
import { formatCardDisplay } from './pokerEval'
import { minCardsForContext, parseVisionResponse, countDealerHoles } from './photoCardMapping'
import { parseRulesVisionResponse } from './rulesPhotoMapping'
import type { ParsedRulesFromPhoto } from '../types/gameRulesKnowledge'

export type PhotoReadContext = 'dealer-up' | 'player-hand' | 'table' | 'dealer-rest'

export interface PhotoReadOptions {
  hasDealerUp?: boolean
  knownDealerUp?: Card | null
}

/** Primary + fallbacks — 2.0 models retired; use 2.5 Flash family. */
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
] as const

function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
}

function buildVisionPrompt(context: PhotoReadContext, expectedCount: number, knownDealerUp?: Card | null): string {
  if (context === 'table') {
    return `Caribbean Stud table photo — ONE shot must capture ALL 6 face-up cards.

Layout: 1 dealer up-card (top/near dealer) + 5 player cards (bottom row), left to right.

Return ONLY valid JSON (no markdown):
{"dealerUp":{"rank":"A"|"2"-"K"|"T","suit":"hearts"|"diamonds"|"clubs"|"spades"},"playerCards":[{...},{...},{...},{...},{...}]}

Rules:
- dealerUp: exactly 1 card (the dealer's face-up card).
- playerCards: exactly 5 cards in the player's row.
- Use T for ten (never "10"). Skip face-down cards.
- Return all 6 cards in a single response — do not omit player cards.`
  }
  if (context === 'dealer-up') {
    return `Find the single face-up dealer card in this Caribbean Stud photo.
Return ONLY: [{"rank":"...","suit":"hearts"|"diamonds"|"clubs"|"spades"}]
Use T for ten.`
  }
  if (context === 'dealer-rest') {
    const upHint = knownDealerUp
      ? `\nThe dealer up-card is ALREADY LOGGED as ${formatCardDisplay(knownDealerUp)} — do NOT include it in dealerHoleCards.`
      : ''
    return `Caribbean Stud showdown photo. Read the dealer's 5 face-up cards (1 up-card + 4 hole cards).

Return ONLY valid JSON (no markdown):
{"dealerUp":{"rank":"A"|"2"-"K"|"T","suit":"hearts"|"diamonds"|"clubs"|"spades"},"dealerHoleCards":[{...},{...},{...},{...}]}

Alternate format (also OK):
{"dealerCards":[{"rank","suit"}, ...]} with all 5 dealer cards in any order.

Rules:
- dealerHoleCards: EXACTLY 4 cards — the hole cards ONLY, never the up-card.
- Count every dealer card in the dealer row. You must return 4 hole cards.
- Physical order does not matter. Use T for ten.
- Do NOT include player cards.${upHint}`
  }
  return `Find exactly ${expectedCount} PLAYER hole cards in this Caribbean Stud photo (the player's row of 5 cards), left to right.
Do NOT include dealer cards.
Return ONLY a JSON array with ${expectedCount} objects:
[{"rank":"A"|"2"-"K"|"T","suit":"hearts"|"diamonds"|"clubs"|"spades"}]
Use T for ten. You must return all ${expectedCount} player cards visible.`
}

function buildShowdownRetryPrompt(knownDealerUp: Card): string {
  const up = formatCardDisplay(knownDealerUp)
  return `Caribbean Stud showdown — recount the dealer row carefully.

The up-card ${up} is already logged. Find the OTHER 4 dealer cards (not player cards, not ${up}).

Return ONLY valid JSON:
{"dealerHoleCards":[{"rank":"A"|"2"-"K"|"T","suit":"hearts"|"diamonds"|"clubs"|"spades"}, ...]}

You MUST return exactly 4 cards in dealerHoleCards. Use T for ten.`
}

async function tryGeminiModels(
  apiKey: string,
  prompt: string,
  base64Data: string,
  mime: string,
  context: PhotoReadContext,
  knownUp: Card | null
): Promise<{ cards: Card[]; parsed: ReturnType<typeof parseVisionResponse>; error?: string; status: number; holeCount: number } | null> {
  let lastError = 'Gemini vision failed'
  let best: { cards: Card[]; parsed: ReturnType<typeof parseVisionResponse>; holeCount: number } | null = null

  for (const model of GEMINI_MODELS) {
    const result = await callGeminiVision(apiKey, model, prompt, base64Data, mime, context)
    if (result.error && result.cards.length === 0) {
      lastError = result.error
      if (result.error?.includes('API key') || result.error?.includes('403')) break
      if (shouldRetryAfterVisionFailure(result.status, result.error)) continue
      break
    }

    const holeCount = context === 'dealer-rest'
      ? countDealerHoles(result.parsed, knownUp)
      : result.cards.length

    if (context === 'dealer-rest' && holeCount >= 4) {
      return { ...result, holeCount }
    }
    if (context !== 'dealer-rest') {
      return { ...result, holeCount }
    }

    if (holeCount >= 3 && (!best || holeCount > best.holeCount)) {
      best = { cards: result.cards, parsed: result.parsed, holeCount }
    }

    if (result.error) lastError = result.error
    if (result.error?.includes('API key') || result.error?.includes('403')) break
    if (shouldRetryAfterVisionFailure(result.status, result.error)) continue
    if (!shouldTryNextModel(result.status, result.error)) break
  }

  if (best) return { cards: best.cards, parsed: best.parsed, status: 200, holeCount: best.holeCount, error: lastError }
  return { cards: [], parsed: { dealerUp: null, playerCards: [], dealerHoleCards: [], flat: [] }, error: lastError, status: 200, holeCount: 0 }
}

function parseGeminiError(status: number, body: string): string {
  try {
    const data = JSON.parse(body)
    const msg = data?.error?.message as string | undefined
    if (msg) {
      if (status === 404 || msg.toLowerCase().includes('no longer available')) {
        return `Model unavailable: ${msg.slice(0, 80)}`
      }
      if (status === 413 || msg.toLowerCase().includes('size')) return 'Photo too large — try again.'
      if (status === 403) return 'Gemini API key invalid. Check ⚙️ Settings.'
      if (status === 429) return 'Gemini rate limit — wait a moment and retry.'
      return `Gemini: ${msg.slice(0, 120)}`
    }
  } catch { /* ignore */ }
  return `Gemini error (${status})`
}

function shouldTryNextModel(status: number, error?: string): boolean {
  if (status === 404) return true
  if (!error) return false
  const lower = error.toLowerCase()
  return lower.includes('no longer available') || lower.includes('not found') || lower.includes('model unavailable')
}

/** Try fallback models when a model responds but JSON/card parse fails. */
function shouldRetryAfterVisionFailure(status: number, error?: string): boolean {
  if (status === 200 && error?.toLowerCase().includes('could not read')) return true
  if (status === 200 && error?.toLowerCase().includes('empty response')) return true
  return shouldTryNextModel(status, error)
}

async function callGeminiGenerate(
  apiKey: string,
  model: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; text: string; status: number; error?: string }> {
  const res = await fetch(geminiUrl(model, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    return { ok: false, text: '', status: res.status, error: parseGeminiError(res.status, errBody) }
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return { ok: true, text, status: res.status }
}

async function callGeminiVision(
  apiKey: string,
  model: string,
  prompt: string,
  base64Data: string,
  mime: string,
  context: PhotoReadContext
): Promise<{ cards: Card[]; parsed: ReturnType<typeof parseVisionResponse>; error?: string; status: number }> {
  const result = await callGeminiGenerate(apiKey, model, {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mime, data: base64Data } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: context === 'table' ? 1200 : 1000,
    },
  })

  if (!result.ok) {
    return { cards: [], parsed: { dealerUp: null, playerCards: [], dealerHoleCards: [], flat: [] }, error: result.error, status: result.status }
  }

  if (!result.text.trim()) {
    return {
      cards: [],
      parsed: { dealerUp: null, playerCards: [], dealerHoleCards: [], flat: [] },
      error: 'Empty response from Gemini — try again with a clearer photo.',
      status: 200,
    }
  }

  const parsed = parseVisionResponse(result.text, context)
  const cards = parsed.flat
  if (cards.length === 0) {
    return {
      cards: [],
      parsed,
      error: 'Could not read cards from photo. Try a clearer, well-lit shot framing all cards.',
      status: 200,
    }
  }

  return { cards, parsed, status: 200 }
}

export async function recognizeCardsFromPhotoGemini(
  imageBase64: string,
  expectedCount: number,
  context: PhotoReadContext = 'player-hand',
  options?: PhotoReadOptions
): Promise<{ cards: Card[]; parsed: ReturnType<typeof parseVisionResponse>; error?: string }> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return { cards: [], parsed: { dealerUp: null, playerCards: [], dealerHoleCards: [], flat: [] }, error: 'Add Gemini API key in ⚙️ Settings for photo read.' }

  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1]! : imageBase64
  const mimeMatch = imageBase64.match(/^data:(image\/[a-z+]+);/i)
  const mime = mimeMatch?.[1] === 'image/png' ? 'image/png' : 'image/jpeg'
  const knownUp = options?.knownDealerUp ?? null
  const prompt = buildVisionPrompt(context, expectedCount, knownUp)
  const minRequired = minCardsForContext(context, expectedCount, !!options?.hasDealerUp)

  if (context === 'dealer-rest') {
    let attempt = await tryGeminiModels(apiKey, prompt, base64Data, mime, context, knownUp)
    if (attempt && attempt.holeCount >= 4) {
      return { cards: attempt.cards, parsed: attempt.parsed }
    }

    if (knownUp && (!attempt || attempt.holeCount < 4)) {
      const retry = await tryGeminiModels(
        apiKey,
        buildShowdownRetryPrompt(knownUp),
        base64Data,
        mime,
        context,
        knownUp
      )
      if (retry && retry.holeCount > (attempt?.holeCount ?? 0)) {
        attempt = retry
      }
    }

    if (attempt && attempt.holeCount >= 4) {
      return { cards: attempt.cards, parsed: attempt.parsed }
    }
    if (attempt && attempt.holeCount >= 3) {
      return { cards: attempt.cards, parsed: attempt.parsed, error: attempt.error }
    }

    return {
      cards: [],
      parsed: { dealerUp: null, playerCards: [], dealerHoleCards: [], flat: [] },
      error: attempt?.error ?? `Only found ${attempt?.holeCount ?? 0}/4 dealer hole cards. Frame all 4 hole cards and retry.`,
    }
  }

  let lastError = 'Gemini vision failed'
  let best: { cards: Card[]; parsed: ReturnType<typeof parseVisionResponse> } | null = null

  for (const model of GEMINI_MODELS) {
    const result = await callGeminiVision(apiKey, model, prompt, base64Data, mime, context)
    if (result.error && result.cards.length === 0) {
      lastError = result.error
      if (result.error?.includes('API key') || result.error?.includes('403')) break
      if (shouldRetryAfterVisionFailure(result.status, result.error)) continue
      break
    }

    const playerCount = result.parsed.playerCards.length
    const total = result.cards.length

    if (context === 'table' && playerCount >= 5) {
      return { cards: result.cards, parsed: result.parsed }
    }
    if (context === 'table' && total >= 6) {
      return { cards: result.cards, parsed: result.parsed }
    }
    if (total >= expectedCount) {
      return { cards: result.cards, parsed: result.parsed }
    }
    if (total >= minRequired) {
      if (!best || total > best.cards.length || playerCount > best.parsed.playerCards.length) {
        best = { cards: result.cards, parsed: result.parsed }
      }
    } else if (context === 'table' && options?.hasDealerUp && playerCount >= 3) {
      if (!best || playerCount > best.parsed.playerCards.length) {
        best = { cards: result.cards, parsed: result.parsed }
      }
    }

    if (result.error) lastError = result.error
    if (result.error?.includes('API key') || result.error?.includes('403')) break
    if (shouldRetryAfterVisionFailure(result.status, result.error)) continue
    if (total > 0) continue
    if (!shouldTryNextModel(result.status, result.error)) break
  }

  if (best && best.cards.length >= minRequired) {
    return { cards: best.cards, parsed: best.parsed }
  }
  if (best && context === 'table' && options?.hasDealerUp && best.parsed.playerCards.length >= 3) {
    return { cards: best.cards, parsed: best.parsed }
  }

  return {
    cards: [],
    parsed: { dealerUp: null, playerCards: [], dealerHoleCards: [], flat: [] },
    error: lastError.includes('Could not read') || lastError.includes('Empty response')
      ? lastError
      : best && best.cards.length > 0
        ? `Only found ${best.cards.length} card(s). Frame the full table and retry.`
        : lastError !== 'Gemini vision failed'
          ? lastError
          : `Only found 0 card(s). Frame the full table and retry.`,
  }
}

export async function getGeminiAdvice(prompt: string): Promise<AiAdvice | null> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return null

  for (const model of GEMINI_MODELS) {
    try {
      const result = await callGeminiGenerate(apiKey, model, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
      })

      if (!result.ok) {
        console.warn(`Gemini ${model} error`, result.error)
        if (result.error?.includes('API key') || result.error?.includes('403')) break
        if (shouldTryNextModel(result.status, result.error)) continue
        break
      }

      const jsonMatch = result.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) return JSON.parse(jsonMatch[0]) as AiAdvice
    } catch (e) {
      console.warn(`Gemini ${model} request failed`, e)
    }
  }

  return null
}

export async function testGeminiConnection(): Promise<{ ok: boolean; message: string }> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return { ok: false, message: 'No Gemini API key set' }

  const advice = await getGeminiAdvice(
    'Respond ONLY with JSON: {"verdict":"good","headline":"Test OK","detail":"Gemini connected","recommendedAction":"Raise $10","betAmount":10,"confidence":0.99,"urgent":false}'
  )
  if (advice?.headline) return { ok: true, message: `Connected (${GEMINI_MODELS[0]}) — ${advice.headline}` }
  return { ok: false, message: 'Could not reach Gemini. Check your API key.' }
}

export function buildCaribbeanPrompt(params: {
  playerCards: string
  dealerUp: string
  ante: number
  raiseAmt: number
  raiseMult: number
  tableRulesContext?: string
}): string {
  const rulesBlock = params.tableRulesContext
    ? `\n\nTABLE-SPECIFIC RULES (follow these over generic defaults):\n${params.tableRulesContext}\n`
    : ''

  return `You are an expert Caribbean Stud poker coach. Analyze this hand and recommend the optimal play to maximize EV.

Dealer up-card: ${params.dealerUp}
Player cards: ${params.playerCards}
Ante: $${params.ante}
Raise: ${params.raiseMult}× ante = $${params.raiseAmt}
${rulesBlock}
Caribbean Stud baseline: Raise with pair+, or Ace-high with J+ kicker when matching dealer up-card. Always max raise when raising.

Respond ONLY with valid JSON (no markdown):
{"verdict":"good|bad|neutral|warning","headline":"short with $ amount","detail":"1-2 sentences","recommendedAction":"Raise $X or Fold","betAmount":number_or_0,"confidence":0.0-1.0,"urgent":true}`
}

export function buildRulesVisionPrompt(gameId: string, gameName: string): string {
  const gameHints: Record<string, string> = {
    'caribbean-stud': 'Look for: ante amount, raise multiplier (2×/3×), dealer qualification (A-K or pair+), ante bonus pay table, progressive jackpot side bet.',
    'three-card-poker': 'Look for: ante, play bet multiplier, Pair Plus side bet pay table, dealer qualifies Queen-high or better, Q-6-4 strategy.',
    'video-poker': 'Look for: bet denominations, Jacks or Better / Deuces Wild pay table, max coins bonus for royal flush.',
    'texas-holdem': 'Look for: blind amounts, betting structure (no-limit/limit), rake, table stakes.',
    'omaha': 'Look for: blind amounts, pot-limit vs no-limit, must use exactly 2 hole + 3 board cards.',
  }

  return `You are reading a casino ${gameName} rules sign, pay table, or felt layout photo.

Extract ALL visible rules, payouts, and strategy-relevant details for game id "${gameId}".
${gameHints[gameId] ?? 'Extract any betting limits, pay tables, and house rules.'}

Return ONLY valid JSON (no markdown):
{
  "rulesSummary": ["how to play bullet 1", "bullet 2"],
  "strategyTips": ["optimal play tip 1", "tip 2"],
  "aiCoachNotes": ["house quirk or edge case for AI coach"],
  "settingOverrides": {"ante": 5, "raiseMultiplier": "2"},
  "dealerQualifyRule": "dealer must have ...",
  "payTableNotes": "Royal Flush 250:1, Full House 7:1, ...",
  "extractSummary": "one sentence of what you read",
  "confidence": 0.0-1.0
}

Rules:
- settingOverrides: only include values clearly visible (ante, raiseMultiplier, playMultiplier, bet, smallBlind, bigBlind, progressiveJackpot).
- Use numbers/strings exactly as shown on the sign.
- strategyTips should maximize player EV given THIS table's rules.
- If text is blurry, return partial results with lower confidence.`
}

export async function recognizeRulesFromPhotoGemini(
  imageBase64: string,
  gameId: string,
  gameName: string
): Promise<{ parsed: ParsedRulesFromPhoto | null; error?: string }> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    return { parsed: null, error: 'Add Gemini API key in ⚙️ Settings for rules photo read.' }
  }

  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1]! : imageBase64
  const mimeMatch = imageBase64.match(/^data:(image\/[a-z+]+);/i)
  const mime = mimeMatch?.[1] === 'image/png' ? 'image/png' : 'image/jpeg'
  const prompt = buildRulesVisionPrompt(gameId, gameName)

  for (const model of GEMINI_MODELS) {
    const result = await callGeminiGenerate(apiKey, model, {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime, data: base64Data } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
    })

    if (!result.ok) {
      if (result.error?.includes('API key') || result.error?.includes('403')) {
        return { parsed: null, error: result.error }
      }
      if (shouldTryNextModel(result.status, result.error)) continue
      return { parsed: null, error: result.error ?? 'Gemini rules vision failed' }
    }

    const parsed = parseRulesVisionResponse(result.text)
    if (parsed) return { parsed }
  }

  return { parsed: null, error: 'Could not parse rules from photo. Try a clearer shot of the pay table or rules sign.' }
}
