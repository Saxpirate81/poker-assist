import type { GameSession } from '../lib/gameSession'
import { formatMoneyWithSymbol } from '../lib/money'

interface GameSessionBarProps {
  session: GameSession
  compact?: boolean
}

export function GameSessionBar({ session, compact }: GameSessionBarProps) {
  const pnlColor = session.netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'
  const pnlSign = session.netPnL >= 0 ? '+' : ''

  return (
    <div className={`rounded-lg border border-white/10 bg-black/30 flex items-center justify-between gap-2 text-[10px] ${compact ? 'px-2 py-1 mb-1' : 'px-3 py-2 mb-3 text-xs'}`}>
      <div className="flex items-center gap-3">
        <div>
          <span className="text-white/40">Stack </span>
          <span className="font-bold text-gold">{formatMoneyWithSymbol(session.bankroll)}</span>
        </div>
        <div className="text-white/30">|</div>
        <div>
          <span className="text-white/40">Session </span>
          <span className={`font-bold ${pnlColor}`}>{pnlSign}{formatMoneyWithSymbol(session.netPnL)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-white/50">
        <span>{session.handsPlayed} hands</span>
        <span className="text-emerald-400/80">{session.plays}↑</span>
        <span className="text-red-400/80">{session.folds}↓</span>
        <span>{session.wins}W-{session.losses}L</span>
      </div>
    </div>
  )
}
