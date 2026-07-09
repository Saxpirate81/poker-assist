import { useCallback, useEffect, useState } from 'react'
import { computeTrends, fetchAllCaribbeanHands } from '../lib/handLogService'
import { loadAllGameMetrics } from '../lib/metricsService'
import { isSupabaseConfigured } from '../lib/config'
import type { HandTrends } from '../types/handLog'
import { formatMoneyWithSymbol } from '../lib/money'

interface HomeStatsCardProps {
  onOpenMetrics?: () => void
  refreshKey?: number
}

export function HomeStatsCard({ onOpenMetrics, refreshKey = 0 }: HomeStatsCardProps) {
  const [trends, setTrends] = useState<HandTrends | null>(null)
  const [totalHandCount, setTotalHandCount] = useState(0)
  const [allGamesPnL, setAllGamesPnL] = useState(0)
  const [loading, setLoading] = useState(true)
  const cloudSync = isSupabaseConfigured()

  const load = useCallback(async () => {
    setLoading(true)
    const [allHands, metrics] = await Promise.all([
      fetchAllCaribbeanHands(),
      loadAllGameMetrics(),
    ])
    setTotalHandCount(allHands.length)
    setTrends(computeTrends(allHands))
    setAllGamesPnL(metrics.bundles.reduce((s, b) => s + b.session.netPnL, 0))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const hasData = totalHandCount > 0
  const pnlColor = (trends?.totalPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
  const allPnlColor = allGamesPnL >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <button
      type="button"
      onClick={onOpenMetrics}
      className="mb-6 w-full text-left rounded-xl border-2 border-gold/30 bg-black/40 px-4 py-3 hover:border-gold/60 hover:bg-black/50 active:scale-[0.99] transition-all shadow-lg shadow-black/20"
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-xs uppercase tracking-wider text-gold font-semibold">📊 Your stats</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-white/40">{cloudSync ? '☁️ Supabase' : '💾 Local only'}</span>
          <span className="text-[10px] text-gold/80 font-medium">Full metrics →</span>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-white/40 text-center py-3">Loading{cloudSync ? ' from cloud' : ''}…</p>
      ) : hasData ? (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-lg font-bold">{totalHandCount}</p>
              <p className="text-[9px] text-white/40">
                Hands{totalHandCount > 100 ? ' (all)' : ''}
              </p>
            </div>
            <div>
              <p className={`text-lg font-bold ${pnlColor}`}>
                {trends!.totalPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(trends!.totalPnL)}
              </p>
              <p className="text-[9px] text-white/40">P&amp;L {totalHandCount > 100 ? '(last 100)' : ''}</p>
            </div>
            <div>
              <p className="text-lg font-bold">{trends!.winRate.toFixed(0)}%</p>
              <p className="text-[9px] text-white/40">{trends!.wins}W-{trends!.losses}L</p>
            </div>
            <div>
              <p className="text-lg font-bold">{trends!.currentStreak}</p>
              <p className="text-[9px] text-white/40">Streak</p>
            </div>
          </div>
          <p className="text-[10px] text-white/40 text-center mt-2">
            {trends!.raises} raises · {trends!.folds} folds · dlr {trends!.dealer.qualifyRate.toFixed(0)}% qual · {trends!.aiFollowRate.toFixed(0)}% follow AI
            {allGamesPnL !== trends!.totalPnL && (
              <> · all games <span className={allPnlColor}>{allGamesPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(allGamesPnL)}</span></>
            )}
          </p>
        </>
      ) : (
        <div className="py-2 text-center">
          <p className="text-sm text-white/70">No hands found</p>
          {cloudSync ? (
            <p className="text-xs text-white/45 mt-1">Supabase connected — finish a Caribbean Stud hand to log data</p>
          ) : (
            <p className="text-xs text-white/45 mt-1">
              Add Supabase in ⚙️ Settings to sync across devices, or play a hand to save locally
            </p>
          )}
          <p className="text-[10px] text-gold/70 mt-2">Tap to open metrics dashboard →</p>
        </div>
      )}
    </button>
  )
}
