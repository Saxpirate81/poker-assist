import { useState } from 'react'
import { clampAnte, formatMoney, parseMoneyInput } from '../lib/money'

const PRESETS = [0.25, 0.5, 1, 2, 5, 10, 15, 25, 50, 100, 150, 200, 250, 500]
const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.', '⌫'] as const

interface AnteCalculatorPopupProps {
  value: number
  onChange: (value: number) => void
  onClose: () => void
}

export function AnteCalculatorPopup({ value, onChange, onClose }: AnteCalculatorPopupProps) {
  const [draft, setDraft] = useState(formatMoney(value))

  const commit = (n: number) => {
    onChange(clampAnte(n))
    onClose()
  }

  const applyDraft = () => commit(parseMoneyInput(draft))

  const appendKey = (key: string) => {
    if (key === 'C') {
      setDraft('')
      return
    }
    if (key === '⌫') {
      setDraft(d => d.slice(0, -1))
      return
    }
    if (key === '.') {
      if (!draft.includes('.')) setDraft(d => (d || '0') + '.')
      return
    }
    // digit
    const next = draft === '0' && key !== '.' ? key : draft + key
    if ((next.split('.')[1]?.length ?? 0) > 2) return
    const parsed = parseFloat(next)
    if (Number.isFinite(parsed) && parsed <= 500) setDraft(next)
  }

  const display = draft === '' ? '0' : draft

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[280px] rounded-2xl bg-slate-900 border border-white/15 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
          <span className="text-sm font-semibold text-gold">Set ante</span>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-4 py-3 bg-black/40">
          <div className="text-right text-4xl font-bold text-gold tabular-nums">${display}</div>
          <p className="text-right text-[10px] text-white/40 mt-1">Min $0.25 · quarters &amp; halves OK</p>
        </div>

        {/* Quarter/half quick row */}
        <div className="px-3 py-2 flex gap-1.5 border-b border-white/10">
          {[0.25, 0.5, 0.75, 1].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => commit(p)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold ${
                Math.abs(value - p) < 0.001 ? 'bg-gold text-slate-900' : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              ${formatMoney(p)}
            </button>
          ))}
        </div>

        <div className="px-3 py-2 grid grid-cols-4 gap-1.5 border-b border-white/10 max-h-32 overflow-y-auto">
          {PRESETS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => commit(p)}
              className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                Math.abs(value - p) < 0.001
                  ? 'bg-gold text-slate-900'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              ${formatMoney(p)}
            </button>
          ))}
        </div>

        <div className="p-3 grid grid-cols-3 gap-1.5">
          {PAD_KEYS.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => appendKey(key)}
              className={`py-3 rounded-xl text-lg font-bold transition-colors ${
                key === 'C'
                  ? 'bg-red-900/50 text-red-300 hover:bg-red-900/70'
                  : key === '⌫'
                    ? 'bg-white/10 text-white/70 hover:bg-white/20'
                    : key === '.'
                      ? 'bg-white/10 text-gold hover:bg-white/20'
                      : 'bg-white/15 text-white hover:bg-white/25 active:scale-95'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="px-3 pb-3 flex gap-2">
          <button
            type="button"
            onClick={() => { setDraft(formatMoney(value)); onClose() }}
            className="flex-1 py-2.5 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyDraft}
            className="flex-1 py-2.5 rounded-xl bg-gold text-slate-900 text-sm font-bold hover:bg-gold-dark"
          >
            Set ${display}
          </button>
        </div>
      </div>
    </div>
  )
}
