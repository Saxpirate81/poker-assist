import { useRef, useState } from 'react'
import type { ParsedRulesFromPhoto } from '../types/gameRulesKnowledge'
import { recognizeRulesFromPhoto } from '../lib/aiService'
import { compressImageForAi } from '../lib/imageUtils'
import { getGeminiApiKey, getOpenAiApiKey } from '../lib/config'

interface RulesPhotoCaptureProps {
  gameId: string
  gameName: string
  onRulesParsed: (parsed: ParsedRulesFromPhoto) => void
  disabled?: boolean
}

export function RulesPhotoCapture({
  gameId,
  gameName,
  onRulesParsed,
  disabled,
}: RulesPhotoCaptureProps) {
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
      const base64 = await compressImageForAi(file, { maxDim: 2048, quality: 0.9 })
      const result = await recognizeRulesFromPhoto(base64, gameId, gameName)
      if (result.error && !result.parsed) {
        setError(result.error)
        return
      }
      if (!result.parsed) {
        setError('No rules detected. Frame the pay table or rules sign clearly.')
        return
      }
      onRulesParsed(result.parsed)
      const n = result.parsed.rulesSummary.length + result.parsed.strategyTips.length
      setSuccess(`✓ Rules updated (${n} items, ${Math.round(result.parsed.confidence * 100)}% confidence)`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rules photo read failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-gold/30 bg-black/30 p-3">
      <p className="text-sm font-semibold text-gold mb-1">📋 Snap table rules / pay table</p>
      <p className="text-xs text-white/50 mb-2">
        Photo the casino rules sign — AI updates strategy and coach notes for this table.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading || disabled || !hasAi}
        className="w-full py-2.5 rounded-xl bg-gold text-slate-900 font-bold text-sm hover:bg-gold-dark transition-colors disabled:opacity-40"
      >
        {loading ? 'Analyzing rules…' : 'Photo: read rules sign'}
      </button>
      {!hasAi && (
        <p className="mt-1.5 text-[11px] text-amber-400 text-center">Add Gemini key in ⚙️ Settings</p>
      )}
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
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400 font-medium">{success}</p>}
    </div>
  )
}
