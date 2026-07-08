import { useState } from 'react'
import type { HandTrends, LoggedCaribbeanHand } from '../types/handLog'
import { formatHandLine } from '../lib/handLogService'
import { formatMoneyWithSymbol } from '../lib/money'

interface HandTrendsPanelProps {
  hands: LoggedCaribbeanHand[]
  trends: HandTrends
  cloudSync: boolean
  defaultCollapsed?: boolean
  onDeleteHand?: (id: string) => void
  onClearAll?: () => void
}

export function HandTrendsPanel({
  hands,
  trends,
  cloudSync,
  defaultCollapsed = true,
  onDeleteHand,
  onClearAll,
}: HandTrendsPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  if (hands.length === 0) return null

  const pnlColor = trends.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-black/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5"
      >
        <p className="text-xs uppercase tracking-wider text-gold font-semibold">
          Trends · {trends.totalHands} hands · <span className={pnlColor}>{trends.totalPnL >= 0 ? '+' : ''}{trends.totalPnL.toFixed(0)}</span>
        </p>
        <span className="text-[10px] text-white/40">{collapsed ? '▾' : '▴'} {cloudSync ? '☁️' : '💾'}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 border-t border-white/5">
          <div className="grid grid-cols-4 gap-2 my-2 text-center">
            <div className="rounded-lg bg-white/5 py-2">
              <p className="text-lg font-bold">{trends.totalHands}</p>
              <p className="text-[9px] text-white/40">Hands</p>
            </div>
            <div className="rounded-lg bg-white/5 py-2">
              <p className={`text-lg font-bold ${pnlColor}`}>{trends.totalPnL >= 0 ? '+' : ''}{trends.totalPnL.toFixed(0)}</p>
              <p className="text-[9px] text-white/40">P&amp;L</p>
            </div>
            <div className="rounded-lg bg-white/5 py-2">
              <p className="text-lg font-bold">{trends.winRate.toFixed(0)}%</p>
              <p className="text-[9px] text-white/40">Win rate</p>
            </div>
            <div className="rounded-lg bg-white/5 py-2">
              <p className="text-lg font-bold">{trends.aiFollowRate.toFixed(0)}%</p>
              <p className="text-[9px] text-white/40">Follow AI</p>
            </div>
          </div>

          <div className="flex gap-3 text-xs text-white/50 mb-2">
            <span>{trends.raises} raises</span>
            <span>{trends.folds} folds</span>
            <span>Avg ante {formatMoneyWithSymbol(trends.avgAnte)}</span>
            <span>Streak {trends.recentStreak}</span>
          </div>

          <div className="space-y-1 max-h-36 overflow-y-auto">
            {hands.slice(0, 20).map(h => (
              <div key={h.id} className="flex items-center gap-1 text-xs text-white/60 border-b border-white/5 pb-1">
                <span className="truncate flex-1">{formatHandLine(h)}</span>
                <span className={`shrink-0 ${h.followedAi ? 'text-emerald-500/70' : 'text-amber-500/70'}`}>
                  {h.followedAi ? '✓AI' : '≠AI'}
                </span>
                {onDeleteHand && (
                  <button
                    type="button"
                    onClick={() => onDeleteHand(h.id)}
                    className="shrink-0 w-6 h-6 rounded text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                    aria-label="Delete hand"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {onClearAll && hands.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="mt-2 w-full py-1.5 text-[10px] text-red-400/80 hover:text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10"
            >
              Clear all hands
            </button>
          )}
        </div>
      )}
    </div>
  )
}
