import type { PokerGame } from '../types/poker'
import { useState } from 'react'
import { HomeStatsCard } from './HomeStatsCard'
import { MetricsDashboard } from './MetricsDashboard'
import { POKER_GAMES } from '../data/games'

interface GameSelectProps {
  onSelect: (game: PokerGame) => void
  onQuickStartCaribbean: () => void
}

export function GameSelect({ onSelect, onQuickStartCaribbean }: GameSelectProps) {
  const [showMetrics, setShowMetrics] = useState(false)
  const [statsRefresh, setStatsRefresh] = useState(0)
  const otherGames = POKER_GAMES.filter(g => g.id !== 'caribbean-stud')

  const closeMetrics = () => {
    setShowMetrics(false)
    setStatsRefresh(k => k + 1)
  }

  return (
    <>
      {showMetrics && <MetricsDashboard onClose={closeMetrics} />}
      <div className="max-w-lg mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <div className="text-5xl mb-3">🃏</div>
        <h1 className="text-3xl font-bold tracking-tight">Poker Assist</h1>
        <p className="text-white/60 mt-2 text-sm">Tap cards. Get coached. Maximize every bet.</p>
      </header>

      {/* Caribbean Stud hero */}
      <button
        type="button"
        onClick={onQuickStartCaribbean}
        className="w-full mb-6 p-5 rounded-2xl bg-gradient-to-br from-emerald-800/80 to-emerald-950 border-2 border-gold/50 hover:border-gold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-emerald-900/30"
      >
        <div className="flex items-center gap-4">
          <span className="text-5xl">🏝️</span>
          <div className="text-left flex-1">
            <p className="text-xs text-gold uppercase tracking-wider font-semibold">Quick start</p>
            <h2 className="font-bold text-xl">Caribbean Stud</h2>
            <p className="text-sm text-white/70 mt-0.5">Jump straight to the table — ante, cards, raise/fold</p>
          </div>
          <span className="text-gold text-2xl">→</span>
        </div>
      </button>

      <HomeStatsCard onOpenMetrics={() => setShowMetrics(true)} refreshKey={statsRefresh} />

      <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Other games</p>
      <div className="grid gap-3">
        {otherGames.map(game => (
          <button
            key={game.id}
            type="button"
            onClick={() => onSelect(game)}
            className="group w-full text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-gold/40 transition-all"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">{game.emoji}</span>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold">{game.name}</h2>
                <p className="text-sm text-white/50 line-clamp-1">{game.description}</p>
              </div>
              <span className="text-gold opacity-0 group-hover:opacity-100">→</span>
            </div>
          </button>
        ))}
      </div>
      </div>
    </>
  )
}
