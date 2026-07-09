import { useRef, useState } from 'react'
import type { Card } from '../types/poker'
import { recognizeCardsFromPhoto } from '../lib/aiService'
import { compressImageForAi } from '../lib/imageUtils'
import type { PhotoReadContext } from '../lib/geminiService'
import { mapDetectedCardsToSlots, sanitizePhotoMapping, sanitizeShowdownMapping } from '../lib/photoCardMapping'
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
      const base64 = await compressImageForAi(
        file,
        context === 'dealer-rest' ? { maxDim: 2048, quality: 0.9 } : undefined
      )
      const hasDealerUp = !!existingCards['d1']
      const result = await recognizeCardsFromPhoto(base64, expectedCount, context, {
        hasDealerUp,
        knownDealerUp: existingCards['d1'] ?? null,
      })
      if (result.error && result.cards.length === 0) {
        setError(result.error)
        return
      }
      if (result.cards.length === 0) {
        setError('No cards detected. Try better lighting and fill the frame with cards.')
        return
      }
      let mapping = mapDetectedCardsToSlots(result.parsed, slotIds, context, existingCards)
      const sanitized = context === 'dealer-rest'
        ? sanitizeShowdownMapping(mapping, existingCards)
        : sanitizePhotoMapping(mapping, existingCards)
      mapping = sanitized.mapping
      const warnings = sanitized.warnings
      const n = Object.keys(mapping).length
      if (n === 0) {
        setError(warnings[0] ?? 'No valid cards from photo — try again with clearer framing.')
        return
      }
      const playerMapped = slotIds.filter(id => id.startsWith('p') && mapping[id]).length
      const mergedDealer = { ...existingCards, ...mapping }

      if (context === 'table') {
        if (playerMapped > 0 && playerMapped < 3) {
          setError(`Only ${playerMapped}/5 player cards — frame full table in photo.`)
          return
        }
        if (!hasDealerUp && !mapping['d1'] && playerMapped < 3) {
          setError('Need dealer up-card + your 5 cards in one photo.')
          return
        }
      }
      if (context === 'player-hand' && playerMapped < 3) {
        setError(`Only mapped ${playerMapped}/5 player cards — include full hand in photo.`)
        return
      }
      if (context === 'dealer-rest') {
        const holesFilled = ['d2', 'd3', 'd4', 'd5'].filter(id => mergedDealer[id]).length
        onCardsDetected(mapping)
        if (holesFilled < 4) {
          const missing = ['d2', 'd3', 'd4', 'd5'].filter(id => !mergedDealer[id]).join(', ')
          setError(`Got ${holesFilled}/4 hole cards — tap ${missing.toUpperCase()} or retake photo closer.`)
          return
        }
      } else {
        onCardsDetected(mapping)
      }
      setSuccess(
        `📸 ${n} card${n === 1 ? '' : 's'} from photo`
        + (playerMapped > 0 ? ` · ${playerMapped} yours` : '')
        + (context === 'dealer-rest'
          ? ` · ${['d2', 'd3', 'd4', 'd5'].filter(id => mergedDealer[id]).length}/4 dealer holes`
          : mapping['d1'] && !hasDealerUp ? ' · dealer up' : '')
        + (warnings.length ? ` · ${warnings.length} dup skipped` : '')
        + ' — coach below ↓'
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
          className="w-full py-3 rounded-xl bg-gold text-slate-900 font-bold text-base hover:bg-gold-dark transition-colors disabled:opacity-40 active:scale-[0.98]"
        >
          {buttonLabel}
        </button>
        {!hasAi && (
          <p className="mt-1 text-center text-[11px] text-amber-400">Add Gemini key in ⚙️ Settings for photo read</p>
        )}
        {fileInput}
        {error && <p className="mt-1 text-xs text-red-400 text-center">{error}</p>}
        {success && <p className="mt-1 text-xs text-sky-300/90 font-medium text-center">{success}</p>}
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
        {success && <p className="mt-0.5 text-[10px] text-sky-300/90 font-medium truncate">{success}</p>}
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
      {success && <p className="mt-2 text-xs text-sky-300/90 font-medium">{success}</p>}
    </div>
  )
}
