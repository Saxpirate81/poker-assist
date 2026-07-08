import type { GameRuleSetting } from '../types/poker'
import { getPrimaryBetRule, getSuggestedBetAmount, ruleValue } from '../lib/handUtils'
import type { PokerGame } from '../types/poker'

const CHIP_PRESETS = [1, 5, 10, 25, 50, 100]

interface QuickBetBarProps {
  game: PokerGame
  rules: GameRuleSetting[]
  onChange: (rules: GameRuleSetting[]) => void
}

export function QuickBetBar({ game, rules, onChange }: QuickBetBarProps) {
  const primary = getPrimaryBetRule(rules)
  const primaryId = primary?.id ?? 'ante'
  const primaryValue = Number(ruleValue(rules, primaryId)) || 5
  const primaryLabel = primary?.label.replace(' ($)', '').replace('($)', '') ?? 'Bet'

  const raiseMult = Number(ruleValue(rules, 'raiseMultiplier')) || 2
  const playMult = Number(ruleValue(rules, 'playMultiplier')) || 1
  const hasRaise = rules.some(r => r.id === 'raiseMultiplier')
  const hasPlay = rules.some(r => r.id === 'playMultiplier')

  const updateRule = (id: string, value: number | boolean | string) => {
    onChange(rules.map(r => (r.id === id ? { ...r, value } : r)))
  }

  const setPrimary = (val: number) => {
    const clamped = Math.max(1, Math.min(500, val))
    updateRule(primaryId, clamped)
  }

  const raiseAmount = getSuggestedBetAmount(game, rules, 'raise')
  const playAmount = getSuggestedBetAmount(game, rules, 'play')

  return (
    <div className="rounded-2xl border border-gold/30 bg-black/40 backdrop-blur-sm p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider text-gold font-semibold">Quick bets</p>
        {(hasRaise || hasPlay) && (
          <p className="text-xs text-white/50">
            {hasRaise && <>Raise <span className="text-gold font-bold">${raiseAmount}</span></>}
            {hasRaise && hasPlay && ' · '}
            {hasPlay && <>Play <span className="text-gold font-bold">${playAmount}</span></>}
          </p>
        )}
      </div>

      {/* Chip presets */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {CHIP_PRESETS.map(chip => (
          <button
            key={chip}
            type="button"
            onClick={() => setPrimary(chip)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
              primaryValue === chip
                ? 'bg-gold text-slate-900 scale-105'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            ${chip}
          </button>
        ))}
      </div>

      {/* Primary bet stepper */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-white/60 w-16 shrink-0">{primaryLabel}</span>
        <button
          type="button"
          onClick={() => setPrimary(primaryValue - (primaryValue >= 25 ? 5 : 1))}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-xl font-bold transition-colors"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          max={500}
          value={primaryValue}
          onChange={e => setPrimary(Number(e.target.value) || 1)}
          className="flex-1 text-center py-2 rounded-xl bg-white/5 border border-white/10 text-lg font-bold text-gold"
        />
        <button
          type="button"
          onClick={() => setPrimary(primaryValue + (primaryValue >= 25 ? 5 : 1))}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-xl font-bold transition-colors"
        >
          +
        </button>
      </div>

      {/* Secondary quick toggles */}
      {(hasRaise || hasPlay) && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-white/10">
          {hasRaise && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-white/40">Raise×</span>
              {[2, 3].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateRule('raiseMultiplier', String(m))}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    raiseMult === m ? 'bg-gold text-slate-900' : 'bg-white/10 text-white/50'
                  }`}
                >
                  {m}×
                </button>
              ))}
            </div>
          )}
          {hasPlay && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-white/40">Play×</span>
              {[1, 2, 3, 4].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateRule('playMultiplier', String(m))}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    playMult === m ? 'bg-gold text-slate-900' : 'bg-white/10 text-white/50'
                  }`}
                >
                  {m}×
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
