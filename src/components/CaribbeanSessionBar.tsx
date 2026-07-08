import type { CaribbeanSession } from '../lib/caribbeanStud'

interface CaribbeanSessionBarProps {
  session: CaribbeanSession
  onAdjustBankroll?: (delta: number) => void
}

export function CaribbeanSessionBar({ session, onAdjustBankroll }: CaribbeanSessionBarProps) {
  const pnlColor = session.netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'
  const pnlSign = session.netPnL >= 0 ? '+' : ''

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 mb-3 flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-3">
        <div>
          <span className="text-white/40">Stack </span>
          <span className="font-bold text-gold">${session.bankroll}</span>
        </div>
        <div className="text-white/30">|</div>
        <div>
          <span className="text-white/40">Session </span>
          <span className={`font-bold ${pnlColor}`}>{pnlSign}${session.netPnL}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-white/50">
        <span>{session.handsPlayed} hands</span>
        <span className="text-emerald-400/80">{session.raises}↑</span>
        <span className="text-red-400/80">{session.folds}↓</span>
        <span>{session.wins}W-{session.losses}L</span>
      </div>
      {onAdjustBankroll && (
        <div className="flex gap-1">
          <button type="button" onClick={() => onAdjustBankroll(-25)} className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20">−</button>
          <button type="button" onClick={() => onAdjustBankroll(25)} className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20">+</button>
        </div>
      )}
    </div>
  )
}
