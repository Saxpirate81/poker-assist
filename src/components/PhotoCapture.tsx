import { useRef, useState } from 'react'
import type { Card } from '../types/poker'
import { recognizeCardsFromPhoto } from '../lib/aiService'
import { compressImageForAi } from '../lib/imageUtils'
import type { PhotoReadContext } from '../lib/geminiService'
import { getGeminiApiKey, getOpenAiApiKey } from '../lib/config'

interface PhotoCaptureProps {
  expectedCount: number
  slotIds: string[]
  onCardsDetected: (mapping: Record<string, Card>) => void
  label?: string
  compact?: boolean
  context?: PhotoReadContext
}

export function PhotoCapture({
  expectedCount,
  slotIds,
  onCardsDetected,
  label,
  compact,
  context = 'player-hand',
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
      const result = await recognizeCardsFromPhoto(base64, expectedCount, context)
      if (result.error && result.cards.length === 0) {
        setError(result.error)
        return
      }
      if (result.cards.length === 0) {
        setError('No cards detected. Try better lighting and fill the frame with cards.')
        return
      }
      const mapping: Record<string, Card> = {}
      result.cards.forEach((card, i) => {
        if (slotIds[i]) mapping[slotIds[i]] = card
      })
      onCardsDetected(mapping)
      const n = Object.keys(mapping).length
      setSuccess(`✓ ${n} card${n === 1 ? '' : 's'} loaded`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo read failed')
    } finally {
      setLoading(false)
    }
  }

  const buttonLabel = loading ? '📸 Reading…' : `📸 ${label ?? 'Photo AI read'}`

  if (compact) {
    return (
      <div className="mb-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading || !hasAi}
            className="flex-1 py-2.5 px-3 rounded-lg bg-gold/20 hover:bg-gold/30 text-gold text-sm font-semibold transition-colors disabled:opacity-40 border border-gold/40"
          >
            {buttonLabel}
          </button>
          {!hasAi && <span className="text-[10px] text-amber-400 shrink-0">⚙️ key</span>}
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
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        {success && <p className="mt-1 text-xs text-emerald-400 font-medium">{success}</p>}
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
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400 font-medium">{success}</p>}
    </div>
  )
}
