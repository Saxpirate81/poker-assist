import { useRef, useState } from 'react'
import type { Card } from '../types/poker'
import { recognizeCardsFromPhoto } from '../lib/aiService'
import { compressImageForAi } from '../lib/imageUtils'
import type { PhotoReadContext } from '../lib/geminiService'
import { mapDetectedCardsToSlots } from '../lib/photoCardMapping'
import { getGeminiApiKey, getOpenAiApiKey } from '../lib/config'

interface PhotoCaptureProps {
  expectedCount: number
  slotIds: string[]
  onCardsDetected: (mapping: Record<string, Card>) => void
  label?: string
  compact?: boolean
  prominent?: boolean
  context?: PhotoReadContext
  existingCards?: Record<string, Card | null>
}

export function PhotoCapture({
  expectedCount,
  slotIds,
  onCardsDetected,
  label,
  compact,
  prominent,
  context = 'player-hand',
  existingCards = {},
}: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const hasAi = !!(getGeminiApiKey() || getOpenAiApiKey())

  const processImage = async (file: File) => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const base64 = await compressImageForAi(file)
      const hasDealerUp = !!existingCards['d1']
      const result = await recognizeCardsFromPhoto(base64, expectedCount, context, { hasDealerUp })
      if (result.error && result.cards.length === 0) {
        setError(result.error)
        return
      }
      if (result.cards.length === 0) {
        setError('No cards detected. Try better lighting and fill the frame with cards.')
        return
      }
      const mapping = mapDetectedCardsToSlots(result.parsed, slotIds, context, existingCards)
      const n = Object.keys(mapping).length
      if (n === 0) {
        setError('Could not map cards to slots. Try framing all 5 player cards.')
        return
      }
      const playerMapped = slotIds.filter(id => id.startsWith('p') && mapping[id]).length
      const dealerHoleMapped = slotIds.filter(id => /^d[2-5]$/.test(id) && mapping[id]).length

      if (context === 'table') {
        if (playerMapped > 0 && playerMapped < 3) {
          setError(`Only ${playerMapped}/5 player cards — frame full table in photo.`)
          return
        }
        if (!mapping['d1'] && playerMapped < 3) {
          setError('Need dealer up-card + your 5 cards in one photo.')
          return
        }
      }
      if (context === 'dealer-rest' && dealerHoleMapped < 3) {
        setError(`Only ${dealerHoleMapped}/4 dealer cards — snap all revealed hole cards.`)
        return
      }
      if (context === 'player-hand' && playerMapped < 3) {
        setError(`Only mapped ${playerMapped}/5 player cards — include full hand in photo.`)
        return
      }
      onCardsDetected(mapping)
      setSuccess(
        `✓ ${n} card${n === 1 ? '' : 's'} loaded`
        + (playerMapped > 0 ? ` (${playerMapped} player)` : '')
        + (dealerHoleMapped > 0 ? ` (${dealerHoleMapped} dealer)` : '')
      )
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo read failed')
    } finally {
      setLoading(false)
    }
  }

  const buttonLabel = loading
    ? '📸 Reading…'
    : prominent
      ? (label ?? 'Snap cards with photo')
      : `📸 ${label ?? 'Photo AI read'}`

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={e => {
        const file = e.target.files?.[0]
        if (file) processImage(file)
        e.target.value = ''
      }}
    />
  )

  if (prominent) {
    return (
      <div className="mt-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading || !hasAi}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-gold/35 to-amber-500/25 hover:from-gold/45 hover:to-amber-500/35 text-gold font-bold text-sm transition-all disabled:opacity-40 border-2 border-gold/60 shadow-lg shadow-gold/10 active:scale-[0.98]"
        >
          {buttonLabel}
        </button>
        {!hasAi && (
          <p className="mt-1 text-center text-[11px] text-amber-400">Add Gemini key in ⚙️ Settings for photo read</p>
        )}
        {fileInput}
        {error && <p className="mt-1 text-xs text-red-400 text-center">{error}</p>}
        {success && <p className="mt-1 text-xs text-emerald-400 font-medium text-center">{success}</p>}
      </div>
    )
  }

  if (compact) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading || !hasAi}
            className="flex-1 py-2 px-2 rounded-lg bg-gold/20 hover:bg-gold/30 text-gold text-xs font-semibold transition-colors disabled:opacity-40 border border-gold/40 truncate"
          >
            {buttonLabel}
          </button>
          {!hasAi && (
            <span className="text-[10px] text-amber-400 shrink-0">⚙️ key</span>
          )}
          {fileInput}
        </div>
        {error && <p className="mt-0.5 text-[10px] text-red-400 truncate">{error}</p>}
        {success && <p className="mt-0.5 text-[10px] text-emerald-400 font-medium truncate">{success}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">📸 {label ?? 'Snap your cards'}</p>
          <p className="text-xs text-white/50">
            {hasAi ? 'Gemini reads the photo and fills slots instantly' : 'Add Gemini key in ⚙️ Settings'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading || !hasAi}
          className="px-4 py-2 rounded-xl bg-gold/20 hover:bg-gold/30 text-gold text-sm font-semibold transition-colors disabled:opacity-40 border border-gold/30"
        >
          {loading ? 'Reading…' : 'Take Photo'}
        </button>
        {fileInput}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400 font-medium">{success}</p>}
    </div>
  )
}
