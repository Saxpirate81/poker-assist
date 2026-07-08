import type { AiAdvice, Card } from '../types/poker'
import { getGeminiApiKey } from './config'
import { normalizeCardFromAi } from './pokerEval'

export type PhotoReadContext = 'dealer-up' | 'player-hand' | 'table' | 'dealer-rest'

const VISION_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash-lite',
] as const

function buildVisionPrompt(context: PhotoReadContext, expectedCount: number): string {
  if (context === 'table') {
    return `Caribbean Stud poker table photo. Find all visible face-up playing cards.
Usually: 1 dealer up-card near the dealer, then 5 player cards in the player's row below.
Return ONLY a JSON array in reading order (dealer up-card first, then player cards left-to-right):
[{"rank":"A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"T"|"J"|"Q"|"K","suit":"hearts"|"diamonds"|"clubs"|"spades"}]
Use T for ten (not "10"). Skip face-down cards. Expect about ${expectedCount} cards.`
  }
  if (context === 'dealer-up') {
    return `Find the single face-up dealer card in this Caribbean Stud photo.
Return ONLY: [{"rank":"...","suit":"hearts"|"diamonds"|"clubs"|"spades"}]
Use T for ten.`
  }
  if (context === 'dealer-rest') {
    return `Find ${expectedCount} dealer hole cards (face-up or revealed) in this photo, left to right.
Return ONLY a JSON array: [{"rank":"A"|"2"-"K"|"T","suit":"hearts"|"diamonds"|"clubs"|"spades"}]
Use T for ten.`
  }
  return `Find ${expectedCount} player hole cards in this Caribbean Stud photo, left to right.
Return ONLY a JSON array: [{"rank":"A"|"2"-"K"|"T","suit":"hearts"|"diamonds"|"clubs"|"spades"}]
Use T for ten. Skip dealer cards.`
}

function parseGeminiError(status: number, body: string): string {
  try {
    const data = JSON.parse(body)
    const msg = data?.error?.message as string | undefined
    if (msg) {
      if (status === 413 || msg.toLowerCase().includes('size')) return 'Photo too large — try again (auto-compress failed).'
      if (status === 403) return 'Gemini API key invalid or vision not enabled. Check ⚙️ Settings.'
      if (status === 429) return 'Gemini rate limit — wait a moment and retry.'
      return `Gemini: ${msg.slice(0, 120)}`
    }
  } catch { /* ignore */ }
  return `Gemini vision error (${status})`
}

async function callGeminiVision(
  apiKey: string,
  model: string,
  prompt: string,
  base64Data: string,
  mime: string
): Promise<{ cards: Card[]; error?: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: base64Data } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    return { cards: [], error: parseGeminiError(res.status, body) }
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const jsonMatch = text.match(/\[[\s\S]*?\]/)
  if (!jsonMatch) {
    return { cards: [], error: 'Could not read cards from photo. Try a clearer, well-lit shot.' }
  }

  const parsed = JSON.parse(jsonMatch[0]) as { rank?: string; suit?: string }[]
  const cards = parsed.map(normalizeCardFromAi).filter((c): c is Card => !!c)
  return { cards }
}

export async function recognizeCardsFromPhotoGemini(
  imageBase64: string,
  expectedCount: number,
  context: PhotoReadContext = 'player-hand'
): Promise<{ cards: Card[]; error?: string }> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return { cards: [], error: 'Add Gemini API key in ⚙️ Settings for photo read.' }

  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1]! : imageBase64
  const mimeMatch = imageBase64.match(/^data:(image\/[a-z+]+);/i)
  const mime = mimeMatch?.[1] === 'image/png' ? 'image/png' : 'image/jpeg'
  const prompt = buildVisionPrompt(context, expectedCount)

  let lastError = 'Gemini vision failed'
  for (const model of VISION_MODELS) {
    const result = await callGeminiVision(apiKey, model, prompt, base64Data, mime)
    if (result.cards.length > 0) return result
    if (result.error) lastError = result.error
    // Don't retry on auth errors
    if (result.error?.includes('API key') || result.error?.includes('403')) break
  }

  return { cards: [], error: lastError }
}

export async function getGeminiAdvice(prompt: string): Promise<AiAdvice | null> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return null

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
        }),
      }
    )

    if (!res.ok) {
      console.warn('Gemini API error', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as AiAdvice
  } catch (e) {
    console.warn('Gemini request failed', e)
    return null
  }
}

export async function testGeminiConnection(): Promise<{ ok: boolean; message: string }> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return { ok: false, message: 'No Gemini API key set' }

  const advice = await getGeminiAdvice(
    'Respond ONLY with JSON: {"verdict":"good","headline":"Test OK","detail":"Gemini connected","recommendedAction":"Raise $10","betAmount":10,"confidence":0.99,"urgent":false}'
  )
  if (advice?.headline) return { ok: true, message: `Connected — ${advice.headline}` }
  return { ok: false, message: 'Could not parse Gemini response. Check your API key.' }
}

export function buildCaribbeanPrompt(params: {
  playerCards: string
  dealerUp: string
  ante: number
  raiseAmt: number
  raiseMult: number
}): string {
  return `You are an expert Caribbean Stud poker coach. Analyze this hand and recommend the optimal play to maximize EV.

Dealer up-card: ${params.dealerUp}
Player cards: ${params.playerCards}
Ante: $${params.ante}
Raise: ${params.raiseMult}× ante = $${params.raiseAmt}

Caribbean Stud rules: Raise with pair+, or Ace-high with J+ kicker when matching dealer up-card. Dealer qualifies with A-K.

Respond ONLY with valid JSON (no markdown):
{"verdict":"good|bad|neutral|warning","headline":"short with $ amount","detail":"1-2 sentences","recommendedAction":"Raise $X or Fold","betAmount":number_or_0,"confidence":0.0-1.0,"urgent":true}`
}
