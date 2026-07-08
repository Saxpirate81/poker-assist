import type { AiAdvice, Card } from '../types/poker'
import { getGeminiApiKey } from './config'

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

export async function recognizeCardsFromPhotoGemini(
  imageBase64: string,
  expectedCount: number
): Promise<{ cards: Card[]; error?: string }> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return { cards: [], error: 'Add Gemini API key in Settings for photo read.' }

  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  const mime = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Identify playing cards in this photo. Expect ~${expectedCount} cards visible.
Return ONLY a JSON array: [{"rank":"A"|"2"-"K"|"T","suit":"hearts"|"diamonds"|"clubs"|"spades"}]
Use T for ten. Left-to-right order. If unsure, omit that card.`,
              },
              { inline_data: { mime_type: mime, data: base64Data } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
        }),
      }
    )

    if (!res.ok) {
      return { cards: [], error: `Gemini vision error: ${res.status}` }
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return { cards: [], error: 'Could not parse cards from photo.' }

    const parsed = JSON.parse(jsonMatch[0]) as Card[]
    return { cards: parsed.filter(c => c.rank && c.suit) }
  } catch (e) {
    return { cards: [], error: e instanceof Error ? e.message : 'Photo read failed' }
  }
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
