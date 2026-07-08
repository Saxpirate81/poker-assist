import type { AiAdvice } from '../types/poker'
import type { CaribbeanBetAnalysis } from '../lib/caribbeanOdds'
import { formatMoneyWithSymbol } from '../lib/money'
import { getAiProvider, getGeminiApiKey, isSupabaseConfigured } from '../lib/config'

interface CaribbeanAnalysisBarProps {
  analysis: CaribbeanBetAnalysis | null
  aiAdvice: (AiAdvice & { provider?: string }) | null
  loading?: boolean
  ante: number
  raiseAmt: number
  cardsReady: boolean
  onOpenSettings?: () => void
}

export function CaribbeanAnalysisBar({
  analysis,
  aiAdvice,
  loading,
  ante,
  raiseAmt,
  cardsReady,
  onOpenSettings,
}: CaribbeanAnalysisBarProps) {
  const hasGemini = !!getGeminiApiKey()
  const provider = getAiProvider()
  const coachLabel = provider === 'gemini' && hasGemini ? 'Gemini' : provider === 'openai' ? 'GPT' : 'Rules'

  if (!cardsReady) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-center">
        <p className="text-xs text-white/50">Log dealer up-card + 5 cards for odds &amp; AI coach</p>
      </div>
    )
  }

  if (!analysis) return null

  const recommend = aiAdvice?.betAmount && aiAdvice.betAmount > 0 ? 'raise' : aiAdvice?.verdict === 'bad' ? 'fold' : analysis.recommend
  const isRaise = recommend === 'raise'
  const headline = aiAdvice?.headline ?? (isRaise ? `Raise ${formatMoneyWithSymbol(raiseAmt)}` : 'Fold')
  const detail = aiAdvice?.detail ?? analysis.reason

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${isRaise ? 'border-emerald-500/50' : 'border-red-500/50'}`}>
      {/* Coach status + recommendation — single row */}
      <div className={`px-3 py-2 flex items-center justify-between gap-2 ${isRaise ? 'bg-emerald-950/90' : 'bg-red-950/90'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{isRaise ? '✅' : '⛔'}</span>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{loading ? 'Analyzing…' : headline}</p>
            <p className="text-[10px] text-white/50 truncate">{detail}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-white/40">{coachLabel}{isSupabaseConfigured() ? ' · ☁️' : ''}</p>
          <p className="text-xs font-bold">{Math.round((aiAdvice?.confidence ?? analysis.confidence) * 100)}%</p>
        </div>
      </div>

      {/* Odds grid — compact, no scroll */}
      <div className="grid grid-cols-4 divide-x divide-white/10 bg-black/50 text-center">
        <OddsCell label="Win" pct={analysis.winPct} color="text-emerald-400" />
        <OddsCell label="Lose" pct={analysis.losePct} color="text-red-400" />
        <OddsCell label="Dlr NQ" pct={analysis.dealerNoQualPct} color="text-sky-400" sub="free win" />
        <OddsCell label="Fold" pct={100} color="text-amber-400" sub={`-${formatMoneyWithSymbol(ante)}`} />
      </div>

      {/* EV row */}
      <div className="grid grid-cols-2 divide-x divide-white/10 bg-black/40 text-center text-xs">
        <div className="py-1.5">
          <span className="text-white/40">Raise EV </span>
          <span className={analysis.raiseEv >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
            {analysis.raiseEv >= 0 ? '+' : ''}{formatMoneyWithSymbol(analysis.raiseEv)}
          </span>
        </div>
        <div className="py-1.5">
          <span className="text-white/40">Fold EV </span>
          <span className="text-red-400 font-bold">{formatMoneyWithSymbol(analysis.foldEv)}</span>
        </div>
      </div>

      {!hasGemini && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full py-1.5 text-[10px] bg-gold/20 text-gold border-t border-gold/30 hover:bg-gold/30"
        >
          ⚙️ Add Gemini key for smarter coaching (free)
        </button>
      )}
    </div>
  )
}

function OddsCell({ label, pct, color, sub }: { label: string; pct: number; color: string; sub?: string }) {
  return (
    <div className="py-1.5 px-1">
      <p className={`text-base font-bold leading-none ${color}`}>{pct}%</p>
      <p className="text-[9px] text-white/40 mt-0.5">{label}</p>
      {sub && <p className="text-[8px] text-white/30">{sub}</p>}
    </div>
  )
}
