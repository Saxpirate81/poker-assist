import { useEffect, useRef, useState } from 'react'
import type { AiAdvice } from '../types/poker'
import type { GameRulesKnowledge } from '../types/gameRulesKnowledge'
import { getAiAdvice } from '../lib/aiService'
import type { HandState } from '../types/poker'
import type { PokerGame } from '../types/poker'
import type { GameRuleSetting } from '../types/poker'
import { cardsFingerprint, hasEnoughCardsForAdvice } from '../lib/handUtils'

interface AiAssistantProps {
  game: PokerGame
  state: HandState
  rules: GameRuleSetting[]
  rulesKnowledge?: GameRulesKnowledge
  onApplyBet?: (amount: number) => void
}

const VERDICT_STYLES: Record<AiAdvice['verdict'], { bg: string; icon: string; border: string; glow: string }> = {
  good: { bg: 'from-emerald-900/90 to-emerald-950/90', icon: '✅', border: 'border-emerald-400/60', glow: 'shadow-emerald-500/30' },
  bad: { bg: 'from-red-900/90 to-red-950/90', icon: '⛔', border: 'border-red-400/60', glow: 'shadow-red-500/30' },
  neutral: { bg: 'from-slate-800/80 to-slate-900/80', icon: '💡', border: 'border-white/10', glow: '' },
  warning: { bg: 'from-amber-900/90 to-amber-950/90', icon: '⚠️', border: 'border-amber-400/60', glow: 'shadow-amber-500/30' },
}

export function AiAssistant({ game, state, rules, rulesKnowledge, onApplyBet }: AiAssistantProps) {
  const [advice, setAdvice] = useState<AiAdvice | null>(null)
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState(false)
  const prevHeadline = useRef<string>('')
  const fingerprint = cardsFingerprint(state.cards)
  const rulesKey = rules.map(r => `${r.id}:${r.value}`).join('|')
  const knowledgeKey = rulesKnowledge
    ? `${rulesKnowledge.updatedAt}:${rulesKnowledge.source}:${rulesKnowledge.strategyTips.length}`
    : ''
  const ready = hasEnoughCardsForAdvice(state, game)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      getAiAdvice(game, state, rules, rulesKnowledge).then(a => {
        if (!cancelled) {
          if (a.headline !== prevHeadline.current) {
            setFlash(true)
            prevHeadline.current = a.headline
            setTimeout(() => setFlash(false), 1200)
          }
          setAdvice(a)
          setLoading(false)
        }
      })
    }, ready ? 80 : 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [game, fingerprint, rulesKey, knowledgeKey, state.currentRound, ready, rulesKnowledge])

  if (!advice && loading) {
    return (
      <div className="rounded-2xl border border-gold/30 bg-black/40 p-4 ai-pulse">
        <p className="text-sm text-gold/80 font-medium">🤖 Analyzing your hand...</p>
      </div>
    )
  }

  if (!advice) return null

  const style = VERDICT_STYLES[advice.verdict]
  const isUrgent = advice.urgent && ready

  return (
    <>
      {/* Sticky urgent banner */}
      {isUrgent && (
        <div className={`sticky top-14 z-30 -mx-4 px-4 py-2 mb-3 bg-gradient-to-r ${style.bg} border-y ${style.border} shadow-lg ${style.glow}`}>
          <p className="text-center font-bold text-sm tracking-wide">
            {style.icon} {advice.headline}
          </p>
        </div>
      )}

      <div
        className={`rounded-2xl border-2 ${style.border} bg-gradient-to-br ${style.bg} p-4 shadow-xl transition-all duration-300 ${
          flash ? 'scale-[1.02] ring-2 ring-gold/50' : ''
        } ${isUrgent ? 'ai-pulse' : ''}`}
      >
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0">{style.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-lg">{advice.headline}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                {Math.round(advice.confidence * 100)}%
              </span>
            </div>
            <p className="text-sm text-white/85 mt-1.5 leading-relaxed">{advice.detail}</p>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {advice.betAmount !== undefined && advice.betAmount > 0 ? (
                <button
                  type="button"
                  onClick={() => onApplyBet?.(advice.betAmount!)}
                  className="flex-1 min-w-[140px] py-3 px-4 rounded-xl bg-gold text-slate-900 font-bold text-base hover:bg-gold-dark transition-colors shadow-lg"
                >
                  {advice.recommendedAction}
                </button>
              ) : advice.verdict === 'bad' ? (
                <button
                  type="button"
                  onClick={() => onApplyBet?.(0)}
                  className="flex-1 min-w-[140px] py-3 px-4 rounded-xl bg-red-600 text-white font-bold text-base hover:bg-red-700 transition-colors"
                >
                  Fold
                </button>
              ) : (
                <span className="text-sm font-semibold bg-white/10 text-white/90 px-4 py-2 rounded-lg">
                  {advice.recommendedAction}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
