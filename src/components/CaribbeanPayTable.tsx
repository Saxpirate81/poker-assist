import { useState } from 'react'
import { ANTE_PAY_TABLE } from '../lib/caribbeanStud'

export function CaribbeanPayTable() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs text-white/60 hover:text-white/80"
      >
        <span>📋 Ante bonus pay table</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {ANTE_PAY_TABLE.map(row => (
            <div key={row.rank} className="flex justify-between text-white/70">
              <span>{row.label}</span>
              <span className="text-gold font-medium">{row.payout}:1</span>
            </div>
          ))}
          <p className="col-span-2 text-white/40 mt-1 pt-1 border-t border-white/10">
            Raise bet pays 1:1 when you win. Dealer needs A-K to qualify.
          </p>
        </div>
      )}
    </div>
  )
}
