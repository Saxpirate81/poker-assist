import { useRef, useState } from 'react'
import type { Card } from '../types/poker'
import { recognizeCardsFromPhoto } from '../lib/aiService'
import { getGeminiApiKey, getOpenAiApiKey } from '../lib/config'

interface PhotoCaptureProps {
  expectedCount: number
  slotIds: string[]
  onCardsDetected: (mapping: Record<string, Card>) => void
  label?: string
  compact?: boolean
}

export function PhotoCapture({ expectedCount, slotIds, onCardsDetected, label, compact }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasAi = !!(getGeminiApiKey() || getOpenAiApiKey())

  const processImage = async (file: File) => {
    setLoading(true)
    setError(null)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      const result = await recognizeCardsFromPhoto(base64, expectedCount)
      setLoading(false)
      if (result.error && result.cards.length === 0) {
        setError(result.error)
        return
      }
      if (result.cards.length === 0) {
        setError('No cards detected. Try a clearer photo.')
        return
      }
      const mapping: Record<string, Card> = {}
      result.cards.forEach((card, i) => {
        if (slotIds[i]) mapping[slotIds[i]] = card
      })
      onCardsDetected(mapping)
    }
    reader.readAsDataURL(file)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading || !hasAi}
          className="flex-1 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors disabled:opacity-40 border border-white/10"
        >
          {loading ? '📸 Reading…' : `📸 ${label ?? 'Photo AI read'}`}
        </button>
        {!hasAi && <span className="text-[10px] text-amber-400 shrink-0">⚙️ key needed</span>}
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
        {error && <p className="text-[10px] text-red-400 absolute mt-8">{error}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">📸 {label ?? 'Snap your cards'}</p>
          <p className="text-xs text-white/50">
            {hasAi ? 'Gemini reads the photo and fills slots' : 'Add Gemini key in ⚙️ Settings'}
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
    </div>
  )
}
