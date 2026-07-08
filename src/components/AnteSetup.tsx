import type { GameRuleSetting } from '../types/poker'
import { ruleValue } from '../lib/handUtils'

const CHIP_PRESETS = [1, 5, 10, 15, 25, 50, 100]

interface AnteSetupProps {
  rules: GameRuleSetting[]
  onChange: (rules: GameRuleSetting[]) => void
  raiseAmount: number
  raiseMult: number
  progressive: number
  progressiveOn: boolean
  onToggleProgressive: () => void
  onPostAnte: () => void
  compact?: boolean
}

export function AnteSetup({
  rules,
  onChange,
  raiseAmount,
  raiseMult,
  progressive,
  progressiveOn,
  onToggleProgressive,
  onPostAnte,
  compact = false,
}: AnteSetupProps) {
  const ante = Number(ruleValue(rules, 'ante')) || 5

  const setAnte = (val: number) => {
    const clamped = Math.max(1, Math.min(500, val))
    onChange(rules.map(r => (r.id === 'ante' ? { ...r, value: clamped } : r)))
  }

  const setRaiseMult = (m: number) => {
    onChange(rules.map(r => (r.id === 'raiseMultiplier' ? { ...r, value: String(m) } : r)))
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-white/50">Ante</span>
        <button type="button" onClick={() => setAnte(ante - (ante >= 25 ? 5 : 1))} className="w-8 h-8 rounded-lg bg-white/10 text-lg font-bold">−</button>
        <span className="text-gold font-bold min-w-[3rem] text-center">${ante}</span>
        <button type="button" onClick={() => setAnte(ante + (ante >= 25 ? 5 : 1))} className="w-8 h-8 rounded-lg bg-white/10 text-lg font-bold">+</button>
        <span className="text-xs text-white/40">Raise ${raiseAmount}</span>
      </div>
    )
  }

  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-widest text-gold/80 mb-3 font-semibold">Set your ante</p>

      {/* Big ante display */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setAnte(ante - (ante >= 25 ? 5 : 1))}
          className="w-14 h-14 rounded-2xl bg-black/30 border border-white/20 text-3xl font-bold hover:bg-black/50 active:scale-95 transition-all"
        >
          −
        </button>
        <div className="min-w-[120px]">
          <input
            type="number"
            min={1}
            max={500}
            value={ante}
            onChange={e => setAnte(Number(e.target.value) || 1)}
            className="w-full text-center text-5xl font-bold text-gold bg-transparent border-none outline-none"
          />
          <p className="text-xs text-white/40 mt-1">ante per hand</p>
        </div>
        <button
          type="button"
          onClick={() => setAnte(ante + (ante >= 25 ? 5 : 1))}
          className="w-14 h-14 rounded-2xl bg-black/30 border border-white/20 text-3xl font-bold hover:bg-black/50 active:scale-95 transition-all"
        >
          +
        </button>
      </div>

      {/* Chip presets */}
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {CHIP_PRESETS.map(chip => (
          <button
            key={chip}
            type="button"
            onClick={() => setAnte(chip)}
            className={`w-12 h-12 rounded-full font-bold text-sm border-2 transition-all ${
              ante === chip
                ? 'bg-gold text-slate-900 border-gold scale-110 shadow-lg shadow-gold/30'
                : 'bg-white/10 text-white/80 border-white/20 hover:border-gold/50 hover:scale-105'
            }`}
          >
            ${chip}
          </button>
        ))}
      </div>

      {/* Raise multiplier + progressive */}
      <div className="flex justify-center items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1 bg-black/30 rounded-xl px-2 py-1">
          <span className="text-xs text-white/50 mr-1">Raise</span>
          {[2, 3].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setRaiseMult(m)}
              className={`px-3 py-1 rounded-lg text-sm font-bold ${
                raiseMult === m ? 'bg-gold text-slate-900' : 'text-white/50 hover:text-white'
              }`}
            >
              {m}×
            </button>
          ))}
          <span className="text-gold font-bold text-sm ml-1">= ${raiseAmount}</span>
        </div>
        <button
          type="button"
          onClick={onToggleProgressive}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium ${
            progressiveOn ? 'bg-purple-600 text-white' : 'bg-white/10 text-white/50'
          }`}
        >
          🎰 {progressiveOn ? `+$${progressive}` : 'Progressive off'}
        </button>
      </div>

      <button
        type="button"
        onClick={onPostAnte}
        className="w-full max-w-xs mx-auto py-4 rounded-2xl bg-gold text-slate-900 font-bold text-xl hover:bg-gold-dark active:scale-[0.98] transition-all shadow-xl shadow-gold/20"
      >
        Post Ante ${ante}
        {progressiveOn ? ` + $${progressive}` : ''}
      </button>
    </div>
  )
}
