import type { ReactNode } from 'react'
import type { PokerGame } from '../types/poker'
import type { GameSession } from '../lib/gameSession'
import { GameSessionBar } from './GameSessionBar'

interface GameHandShellProps {
  game: PokerGame
  stepTitle: string
  stepHint: string
  session: GameSession
  onBack: () => void
  onNewHand: () => void
  onOpenSettings?: () => void
  alert?: string | null
  betStrip?: ReactNode
  felt: ReactNode
  coach?: ReactNode
  footer: ReactNode
}

export function GameHandShell({
  game,
  stepTitle,
  stepHint,
  session,
  onBack,
  onNewHand,
  onOpenSettings,
  alert,
  betStrip,
  felt,
  coach,
  footer,
}: GameHandShellProps) {
  const bannerAlert = !!alert

  return (
    <div className="game-hand-shell fixed inset-0 z-30 flex justify-center overflow-hidden">
      <div className="w-full max-w-lg h-full flex flex-col overflow-hidden px-3 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
        <header className="shrink-0 pt-1 pb-0.5">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white shrink-0">← Exit</button>
            <span className="text-sm font-bold truncate">{game.emoji} {game.name}</span>
            <div className="flex items-center gap-1 shrink-0">
              {onOpenSettings && (
                <button type="button" onClick={onOpenSettings} className="w-8 h-8 rounded-full bg-white/10 text-sm" aria-label="Settings">⚙️</button>
              )}
              <button type="button" onClick={onNewHand} className="text-sm text-gold font-semibold">New →</button>
            </div>
          </div>
          <GameSessionBar session={session} compact />
          <div className={`py-1.5 px-2.5 rounded-lg text-center border ${bannerAlert ? 'bg-red-950/70 border-red-500/40' : 'bg-gold/15 border-gold/40'}`}>
            <p className="text-gold font-bold text-sm leading-tight">{stepTitle}</p>
            <p className={`text-xs leading-tight truncate mt-0.5 ${bannerAlert ? 'text-red-300' : 'text-white/60'}`}>{alert ?? stepHint}</p>
          </div>
          {betStrip && <div className="mt-1">{betStrip}</div>}
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto pb-36">
          {felt}
          {coach && <div className="mt-3">{coach}</div>}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">{footer}</div>
        </div>
      </div>
    </div>
  )
}
