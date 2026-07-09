import { useState } from 'react'
import type { HandTrends, LoggedCaribbeanHand } from '../types/handLog'
import { formatHandLine, formatHandTimestamp, coachFollowed, formatShowdownStreak } from '../lib/handLogService'
import { formatMoneyWithSymbol } from '../lib/money'

interface HandTrendsPanelProps {
  hands: LoggedCaribbeanHand[]
  trends: HandTrends
  cloudSync: boolean
  defaultCollapsed?: boolean
  onDeleteHand?: (id: string) => void
  onClearAll?: () => void
  onOpenFullMetrics?: () => void
}

function PnlSparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null
  const max = Math.max(...values.map(Math.abs), 0.5)
  return (
    <div className="flex items-end gap-0.5 h-10 px-0.5">
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${v >= 0 ? 'bg-emerald-500/80' : 'bg-red-500/80'}`}
          style={{ height: `${Math.max(12, (Math.abs(v) / max) * 100)}%` }}
          title={`${v >= 0 ? '+' : ''}${v.toFixed(2)}`}
        />
      ))}
    </div>
  )
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-2 px-1 text-center">
      <p className={`text-base font-bold leading-tight ${color ?? ''}`}>{value}</p>
      <p className="text-[9px] text-white/40 leading-tight">{label}</p>
      {sub && <p className="text-[8px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  )
}

export function HandTrendsPanel({
  hands,
  trends,
  cloudSync,
  defaultCollapsed = true,
  onDeleteHand,
  onClearAll,
  onOpenFullMetrics,
}: HandTrendsPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const pnlColor = trends.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'
  const todayColor = trends.todayPnL >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5"
      >
        <p className="text-xs uppercase tracking-wider text-gold font-semibold">
          {hands.length === 0
            ? 'Stats · no hands yet'
            : <>Stats · {trends.totalHands} hands · <span className={pnlColor}>{trends.totalPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(trends.totalPnL)}</span></>}
        </p>
        <span className="text-[10px] text-white/40">{collapsed ? '▾' : '▴'} {cloudSync ? '☁️' : '💾'}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 border-t border-white/5">
          {hands.length === 0 ? (
            <p className="text-xs text-white/50 py-3 text-center">
              Finish a hand to start tracking win rate, P&amp;L, and AI follow trends.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1.5 my-2">
                <StatTile label="P&L" value={`${trends.totalPnL >= 0 ? '+' : ''}${formatMoneyWithSymbol(trends.totalPnL)}`} color={pnlColor} />
                <StatTile label="Win rate" value={`${trends.winRate.toFixed(0)}%`} sub={`${trends.wins}W-${trends.losses}L`} />
                <StatTile label="Today" value={`${trends.todayPnL >= 0 ? '+' : ''}${formatMoneyWithSymbol(trends.todayPnL)}`} sub={`${trends.todayHands} hands`} color={todayColor} />
                <StatTile label="Streak" value={trends.currentStreak} sub={trends.recentStreak} />
              </div>

              <div className="grid grid-cols-4 gap-1.5 mb-2">
                <StatTile label="Raises" value={String(trends.raises)} />
                <StatTile label="Folds" value={String(trends.folds)} />
                <StatTile label="Dlr qualify" value={`${trends.dealer.qualifyRate.toFixed(0)}%`} sub={`${trends.dealer.currentQualifyStreak}`} />
                <StatTile label="Dlr streak" value={trends.dealer.currentDealerWinStreak} sub={formatShowdownStreak(trends.dealer.recentShowdownStreak.slice(0, 10))} />
              </div>

              <div className="grid grid-cols-4 gap-1.5 mb-2">
                <StatTile label="Follow AI" value={`${trends.aiFollowRate.toFixed(0)}%`} />
                <StatTile label="Dlr NQ" value={`${trends.dealer.noQualifyRate.toFixed(0)}%`} sub={`${trends.dealer.winsFromNoQual} wins`} />
                <StatTile label="You win" value={`${trends.dealer.playerWinRateWhenQual.toFixed(0)}%`} sub="when qual" />
                <StatTile label="Dlr wins" value={`${trends.dealer.dealerWinRateWhenQual.toFixed(0)}%`} sub={`= ${(trends.dealer.playerWinRateWhenQual + trends.dealer.dealerWinRateWhenQual).toFixed(0)}%`} />
                <StatTile label="Showdowns" value={String(trends.dealer.showdownHands)} />
              </div>

              {trends.recentPnL.length > 0 && (
                <div className="mb-2 rounded-lg bg-white/5 px-2 py-1.5">
                  <p className="text-[9px] text-white/40 mb-1">Last {trends.recentPnL.length} hands P&amp;L</p>
                  <PnlSparkline values={trends.recentPnL} />
                </div>
              )}

              <div className="flex gap-3 text-[10px] text-white/50 mb-2">
                <span>Avg ante {formatMoneyWithSymbol(trends.avgAnte)}</span>
                <span className="text-emerald-400/80">AI ✓ {trends.followAiPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(trends.followAiPnL)}</span>
                <span className="text-amber-400/80">AI ≠ {trends.ignoreAiPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(trends.ignoreAiPnL)}</span>
              </div>

              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {hands.slice(0, 20).map(h => (
                  <div key={h.id} className="border-b border-white/5 pb-1.5">
                    <p className="text-[9px] text-white/35 leading-tight">{formatHandTimestamp(h.createdAt)}</p>
                    <div className="flex items-center gap-1 text-xs text-white/60">
                      <span className="truncate flex-1">{formatHandLine(h)}</span>
                      <span className={`shrink-0 ${coachFollowed(h) ? 'text-emerald-500/70' : 'text-amber-500/70'}`}>
                        {coachFollowed(h) ? '✓AI' : '≠AI'}
                      </span>
                      {h.action === 'raise' && h.dealerCards.length >= 5 && (
                        <span className={`shrink-0 text-[9px] ${h.dealerQualified ? 'text-amber-400/60' : 'text-sky-400/60'}`}>
                          {h.dealerQualified ? 'Q' : 'NQ'}
                        </span>
                      )}
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
                  </div>
                ))}
              </div>

              {onOpenFullMetrics && hands.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenFullMetrics}
                  className="mb-2 w-full py-2 rounded-lg text-xs font-semibold text-gold bg-gold/10 border border-gold/30 hover:bg-gold/20"
                >
                  View full metrics &amp; AI tweaks →
                </button>
              )}

              {onClearAll && hands.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="mt-2 w-full py-1.5 text-[10px] text-red-400/80 hover:text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10"
                >
                  Clear all hands
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
