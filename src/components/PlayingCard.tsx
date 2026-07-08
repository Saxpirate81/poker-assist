import type { Card, Rank, Suit } from '../types/poker'
import { RANK_LABELS, SUIT_COLORS, SUIT_SYMBOLS, formatRankDisplay } from '../lib/pokerEval'

interface PlayingCardProps {
  card: Card | null
  label?: string
  hidden?: boolean
  onClick?: () => void
  selected?: boolean
  delay?: number
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'w-14 h-20',
  md: 'w-20 h-28',
  lg: 'w-24 h-34',
}

export function PlayingCard({
  card,
  label,
  hidden = false,
  onClick,
  selected = false,
  delay = 0,
  size = 'md',
}: PlayingCardProps) {
  const clickable = !!onClick
  const sizeClass = SIZES[size]

  if (hidden && !card) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        className={`${sizeClass} rounded-xl bg-gradient-to-br from-blue-900 to-blue-950 border-2 border-blue-700/50 shadow-lg flex items-center justify-center ${clickable ? 'cursor-pointer hover:scale-105 active:scale-95 transition-transform' : ''}`}
        style={{ animationDelay: `${delay}ms` }}
      >
        <span className="text-2xl opacity-40">🂠</span>
      </button>
    )
  }

  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${sizeClass} card-deal rounded-xl border-2 border-dashed border-gold/40 bg-white/5 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-white/10 hover:border-gold/70 hover:scale-105 active:scale-95 transition-all ${selected ? 'ring-2 ring-gold ai-pulse' : ''}`}
        style={{ animationDelay: `${delay}ms` }}
      >
        <span className="text-2xl">➕</span>
        {label && <span className="text-[10px] text-white/50 uppercase tracking-wide">{label}</span>}
      </button>
    )
  }

  const color = SUIT_COLORS[card.suit]
  const symbol = SUIT_SYMBOLS[card.suit]
  const rankLabel = formatRankDisplay(card.rank)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`${sizeClass} card-deal rounded-xl bg-white shadow-xl flex flex-col items-start justify-between p-2 relative overflow-hidden ${clickable ? 'cursor-pointer hover:scale-105 active:scale-95 transition-transform' : ''} ${selected ? 'ring-2 ring-gold ai-pulse' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-col leading-none" style={{ color }}>
        <span className="text-lg font-bold">{rankLabel}</span>
        <span className="text-base">{symbol}</span>
      </div>
      <span className="absolute inset-0 flex items-center justify-center text-4xl opacity-20" style={{ color }}>
        {symbol}
      </span>
      <div className="self-end flex flex-col items-end leading-none rotate-180" style={{ color }}>
        <span className="text-lg font-bold">{rankLabel}</span>
        <span className="text-base">{symbol}</span>
      </div>
    </button>
  )
}

export function CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`${SIZES[size]} rounded-xl bg-gradient-to-br from-red-800 via-red-900 to-red-950 border-2 border-red-600/30 shadow-lg flex items-center justify-center`}>
      <div className="w-3/4 h-3/4 rounded-lg border border-red-400/20 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.03)_4px,rgba(255,255,255,0.03)_8px)]" />
    </div>
  )
}

export function MiniCardLabel({ rank, suit }: { rank: Rank; suit: Suit }) {
  return (
    <span style={{ color: SUIT_COLORS[suit] }}>
      {formatRankDisplay(rank)}{SUIT_SYMBOLS[suit]}
    </span>
  )
}

export { RANK_LABELS }
