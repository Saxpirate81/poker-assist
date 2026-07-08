import { useState } from 'react'
import type { GameRuleSetting } from '../types/poker'
import { getPrimaryBetRule, getSuggestedBetAmount, ruleValue } from '../lib/handUtils'
import type { PokerGame } from '../types/poker'
import { AnteCalculatorPopup } from './AnteCalculatorPopup'
import { formatMoneyWithSymbol } from '../lib/money'

interface InlineBetStripProps {
  game: PokerGame
  rules: GameRuleSetting[]
  onChange: (rules: GameRuleSetting[]) => void
}

export function InlineBetStrip({ game, rules, onChange }: InlineBetStripProps) {
  const [showCalc, setShowCalc] = useState(false)
  const primary = getPrimaryBetRule(rules)
  const primaryId = primary?.id ?? 'ante'
  const ante = Number(ruleValue(rules, primaryId)) || 5
  const raiseMult = Number(ruleValue(rules, 'raiseMultiplier')) || 2
  const raiseAmt = getSuggestedBetAmount(game, rules, 'raise')
  const hasRaise = rules.some(r => r.id === 'raiseMultiplier')

  const setAnte = (val: number) => {
    onChange(rules.map(r => (r.id === primaryId ? { ...r, value: val } : r)))
  }

  const setRaiseMult = (m: number) => {
    onChange(rules.map(r => (r.id === 'raiseMultiplier' ? { ...r, value: String(m) } : r)))
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setShowCalc(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-gold/50 bg-black/40 hover:bg-black/60 hover:border-gold active:scale-[0.98] transition-all"
        >
          <span className="text-xs uppercase tracking-wider text-white/50">Ante</span>
          <span className="text-xl font-bold text-gold">{formatMoneyWithSymbol(ante)}</span>
          <span className="text-white/30 text-sm">▾</span>
        </button>

        {hasRaise && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/30 border border-white/10">
            <span className="text-xs text-white/50 mr-1">Raise</span>
            {[2, 3].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setRaiseMult(m)}
                className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-colors ${
                  raiseMult === m ? 'bg-gold text-slate-900' : 'bg-white/10 text-white/50 hover:text-white'
                }`}
              >
                {m}×
              </button>
            ))}
            <span className="text-gold font-bold text-sm ml-1">{formatMoneyWithSymbol(raiseAmt)}</span>
          </div>
        )}
      </div>

      {showCalc && (
        <AnteCalculatorPopup
          value={ante}
          onChange={setAnte}
          onClose={() => setShowCalc(false)}
        />
      )}
    </>
  )
}
