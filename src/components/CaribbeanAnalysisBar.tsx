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
  dense?: boolean
}

export function CaribbeanAnalysisBar({
  analysis,
  aiAdvice,
  loading,
  ante,
  raiseAmt,
  cardsReady,
  onOpenSettings,
  dense,
}: CaribbeanAnalysisBarProps) {
  const hasGemini = !!getGeminiApiKey()
  const provider = getAiProvider()
  const coachLabel = provider === 'gemini' && hasGemini ? 'Gemini' : provider === 'openai' ? 'GPT' : 'Rules'

  if (!cardsReady) {
    return (
      <div className={`rounded-lg border border-white/10 bg-black/30 text-center ${dense ? 'px-2 py-1' : 'rounded-xl px-3 py-2'}`}>
        <p className={`text-white/50 ${dense ? 'text-[10px]' : 'text-xs'}`}>Log dealer up-card + 5 cards for odds &amp; AI coach</p>
      </div>
    )
  }

  if (!analysis) return null

  const recommend = aiAdvice?.betAmount && aiAdvice.betAmount > 0 ? 'raise' : aiAdvice?.verdict === 'bad' ? 'fold' : analysis.recommend
  const isRaise = recommend === 'raise'
  const headline = aiAdvice?.headline ?? (isRaise ? `Raise ${formatMoneyWithSymbol(raiseAmt)}` : 'Fold')
  const detail = aiAdvice?.detail ?? analysis.reason

  return (
    <div className={`rounded-lg border-2 overflow-hidden ${isRaise ? 'border-emerald-500/50' : 'border-red-500/50'}`}>
      <div className={`flex items-center justify-between gap-2 ${isRaise ? 'bg-emerald-950/90' : 'bg-red-950/90'} ${dense ? 'px-2 py-1' : 'px-3 py-2'}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`shrink-0 ${dense ? 'text-base' : 'text-lg'}`}>{isRaise ? '✅' : '⛔'}</span>
          <div className="min-w-0">
            <p className={`font-bold truncate ${dense ? 'text-xs' : 'text-sm'}`}>{loading ? 'Analyzing…' : headline}</p>
            {!dense && <p className="text-[10px] text-white/50 truncate">{detail}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] text-white/40">{coachLabel}{isSupabaseConfigured() ? ' · ☁️' : ''}</p>
          <p className={`font-bold ${dense ? 'text-[10px]' : 'text-xs'}`}>{Math.round((aiAdvice?.confidence ?? analysis.confidence) * 100)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-white/10 bg-black/50 text-center">
        <OddsCell label="Win" pct={analysis.winPct} color="text-emerald-400" dense={dense} />
        <OddsCell label="Lose" pct={analysis.losePct} color="text-red-400" dense={dense} />
        <OddsCell label="Dlr NQ" pct={analysis.dealerNoQualPct} color="text-sky-400" sub="free win" dense={dense} />
        <OddsCell label="Fold" pct={100} color="text-amber-400" sub={`-${formatMoneyWithSymbol(ante)}`} dense={dense} />
      </div>

      {!dense && (
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
      )}

      {!hasGemini && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className={`w-full text-[9px] bg-gold/20 text-gold border-t border-gold/30 hover:bg-gold/30 ${dense ? 'py-1' : 'py-1.5 text-[10px]'}`}
        >
          ⚙️ Add Gemini key for smarter coaching (free)
        </button>
      )}
    </div>
  )
}

function OddsCell({ label, pct, color, sub, dense }: { label: string; pct: number; color: string; sub?: string; dense?: boolean }) {
  return (
    <div className={dense ? 'py-1 px-0.5' : 'py-1.5 px-1'}>
      <p className={`font-bold leading-none ${color} ${dense ? 'text-sm' : 'text-base'}`}>{pct}%</p>
      <p className={`text-white/40 ${dense ? 'text-[8px] mt-0' : 'text-[9px] mt-0.5'}`}>{label}</p>
      {sub && <p className="text-[8px] text-white/30">{sub}</p>}
    </div>
  )
}
