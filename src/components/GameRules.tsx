import type { GameRuleSetting } from '../types/poker'
import type { PokerGame } from '../types/poker'

interface GameRulesProps {
  game: PokerGame
  rules: GameRuleSetting[]
  onChange: (rules: GameRuleSetting[]) => void
  onStart: () => void
  onBack: () => void
}

export function GameRules({ game, rules, onChange, onStart, onBack }: GameRulesProps) {
  const updateRule = (id: string, value: number | boolean | string) => {
    onChange(rules.map(r => r.id === id ? { ...r, value } : r))
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white mb-4">
        ← Back
      </button>

      <header className="mb-6">
        <span className="text-4xl">{game.emoji}</span>
        <h1 className="text-2xl font-bold mt-2">{game.name}</h1>
        <p className="text-white/60 text-sm mt-1">{game.description}</p>
      </header>

      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-wider text-gold mb-3">How to play</h2>
        <ul className="space-y-2">
          {game.rulesSummary.map((rule, i) => (
            <li key={i} className="flex gap-2 text-sm text-white/80">
              <span className="text-gold shrink-0">{i + 1}.</span>
              {rule}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-wider text-gold mb-3">Tweak rules</h2>
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
              <label className="text-sm font-medium block mb-1">{rule.label}</label>
              {rule.description && <p className="text-xs text-white/40 mb-2">{rule.description}</p>}
              {rule.type === 'number' && (
                <input
                  type="number"
                  min={rule.min}
                  max={rule.max}
                  step={rule.step ?? 1}
                  value={rule.value as number}
                  onChange={e => updateRule(rule.id, Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                />
              )}
              {rule.type === 'boolean' && (
                <button
                  type="button"
                  onClick={() => updateRule(rule.id, !rule.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${rule.value ? 'bg-gold text-slate-900' : 'bg-white/10 text-white/60'}`}
                >
                  {rule.value ? 'On' : 'Off'}
                </button>
              )}
              {rule.type === 'select' && rule.options && (
                <select
                  value={rule.value as string}
                  onChange={e => updateRule(rule.id, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                >
                  {rule.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-wider text-gold mb-3">Strategy tips</h2>
        <div className="flex flex-wrap gap-2">
          {game.strategyTips.map((tip, i) => (
            <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-emerald-900/40 border border-emerald-500/20 text-emerald-200">
              {tip}
            </span>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={onStart}
        className="w-full py-4 rounded-2xl bg-gold text-slate-900 font-bold text-lg hover:bg-gold-dark transition-colors shadow-lg"
      >
        Start Hand →
      </button>
    </div>
  )
}
