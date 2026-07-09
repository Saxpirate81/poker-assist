import type { AiAdvice } from '../types/poker'
import type { CaribbeanBetAnalysis } from '../lib/caribbeanOdds'
import { aiAdviceSaysRaise } from '../lib/handLogService'
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

function aiSaysFold(advice: AiAdvice | null): boolean {
  if (!advice) return false
  return !aiAdviceSaysRaise(advice)
}

function aiSaysRaise(advice: AiAdvice | null): boolean {
  if (!advice) return false
  return aiAdviceSaysRaise(advice)
}

/** Coach certainty — not the same as win probability. */
function coachConfidencePct(aiAdvice: AiAdvice | null, analysis: CaribbeanBetAnalysis): number {
  const raw = aiAdvice?.confidence ?? analysis.confidence
  return Math.min(92, Math.max(50, Math.round(raw * 100)))
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

  // Rules engine (analysis.recommend) drives green/red — avoids AI saying fold then flipping green.
  const isRaise = analysis.recommend === 'raise'
  const rulesHeadline = isRaise
    ? `Raise ${formatMoneyWithSymbol(raiseAmt)}`
    : 'FOLD — save your raise'
  const rulesDetail = analysis.reason

  const aiAligned = isRaise ? aiSaysRaise(aiAdvice) : aiSaysFold(aiAdvice)
  const headline = loading
    ? 'Analyzing…'
    : (aiAligned && aiAdvice?.headline ? aiAdvice.headline : rulesHeadline)
  const detail = aiAligned && aiAdvice?.detail ? aiAdvice.detail : rulesDetail
  const coachPct = coachConfidencePct(aiAdvice, analysis)

  return (
    <div className={`rounded-lg border-2 overflow-hidden ${isRaise ? 'border-emerald-500/50' : 'border-red-500/50'}`}>
      <div className={`flex items-center justify-between gap-2 ${isRaise ? 'bg-emerald-950/90' : 'bg-red-950/90'} ${dense ? 'px-2 py-1' : 'px-3 py-2'}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`shrink-0 ${dense ? 'text-base' : 'text-lg'}`}>{isRaise ? '✅' : '⛔'}</span>
          <div className="min-w-0">
            <p className={`font-bold truncate ${dense ? 'text-xs' : 'text-sm'}`}>{headline}</p>
            {!dense && <p className="text-[10px] text-white/50 truncate">{detail}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] text-white/40">{coachLabel}{isSupabaseConfigured() ? ' · ☁️' : ''}</p>
          <p className={`font-bold ${dense ? 'text-[10px]' : 'text-xs'}`} title="How sure the coach is — not win odds">
            Coach {coachPct}%
          </p>
        </div>
      </div>

      <p className="text-[8px] text-center text-white/30 bg-black/40 py-0.5">Est. raise outcomes (not guaranteed)</p>

      <div className="grid grid-cols-4 divide-x divide-white/10 bg-black/50 text-center">
        <OddsCell label="Win" pct={analysis.winPct} color="text-emerald-400" dense={dense} />
        <OddsCell label="Lose" pct={analysis.losePct} color="text-red-400" dense={dense} />
        <OddsCell label="Dlr NQ" pct={analysis.dealerNoQualPct} color="text-sky-400" sub="ante paid" dense={dense} />
        <FoldCostCell ante={ante} dense={dense} />
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
      <p className={`font-bold leading-none ${color} ${dense ? 'text-sm' : 'text-base'}`}>~{pct}%</p>
      <p className={`text-white/40 ${dense ? 'text-[8px] mt-0' : 'text-[9px] mt-0.5'}`}>{label}</p>
      {sub && <p className="text-[8px] text-white/30">{sub}</p>}
    </div>
  )
}

function FoldCostCell({ ante, dense }: { ante: number; dense?: boolean }) {
  return (
    <div className={dense ? 'py-1 px-0.5' : 'py-1.5 px-1'}>
      <p className={`font-bold leading-none text-amber-400 ${dense ? 'text-sm' : 'text-base'}`}>−{formatMoneyWithSymbol(ante)}</p>
      <p className={`text-white/40 ${dense ? 'text-[8px] mt-0' : 'text-[9px] mt-0.5'}`}>Fold cost</p>
    </div>
  )
}
