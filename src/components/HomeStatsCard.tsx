import { useEffect, useState } from 'react'
import { computeTrends, fetchCaribbeanHands } from '../lib/handLogService'
import type { HandTrends } from '../types/handLog'
import { formatMoneyWithSymbol } from '../lib/money'

export function HomeStatsCard() {
  const [trends, setTrends] = useState<HandTrends | null>(null)

  useEffect(() => {
    fetchCaribbeanHands(100).then(hands => setTrends(computeTrends(hands)))
  }, [])

  if (!trends || trends.totalHands === 0) return null

  const pnlColor = trends.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Your stats</p>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-lg font-bold">{trends.totalHands}</p>
          <p className="text-[9px] text-white/40">Hands</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${pnlColor}`}>
            {trends.totalPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(trends.totalPnL)}
          </p>
          <p className="text-[9px] text-white/40">P&amp;L</p>
        </div>
        <div>
          <p className="text-lg font-bold">{trends.winRate.toFixed(0)}%</p>
          <p className="text-[9px] text-white/40">{trends.wins}W-{trends.losses}L</p>
        </div>
        <div>
          <p className="text-lg font-bold">{trends.currentStreak}</p>
          <p className="text-[9px] text-white/40">Streak</p>
        </div>
      </div>
      <p className="text-[10px] text-white/40 text-center mt-2">
        {trends.raises} raises · {trends.folds} folds · {trends.aiFollowRate.toFixed(0)}% follow AI
      </p>
    </div>
  )
}
