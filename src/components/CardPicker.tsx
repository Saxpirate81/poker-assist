import { useState } from 'react'
import type { Card, Rank, Suit } from '../types/poker'
import { RANKS, SUITS, RANK_LABELS, SUIT_SYMBOLS, SUIT_COLORS, formatRankDisplay } from '../lib/pokerEval'

interface CardPickerProps {
  slotLabel: string
  current: Card | null
  usedCards?: Card[]
  onSelect: (card: Card) => void
  onClose: () => void
}

const SUIT_THEMES: Record<Suit, {
  bg: string
  bgActive: string
  border: string
  label: string
  iconInactive: string
  iconActive: string
  textInactive: string
}> = {
  hearts: {
    bg: 'bg-red-950/90',
    bgActive: 'bg-red-600',
    border: 'border-red-400',
    label: 'Hearts',
    iconInactive: '#fca5a5',
    iconActive: '#ffffff',
    textInactive: 'text-red-200',
  },
  diamonds: {
    bg: 'bg-orange-950/90',
    bgActive: 'bg-orange-600',
    border: 'border-orange-400',
    label: 'Diamonds',
    iconInactive: '#fdba74',
    iconActive: '#ffffff',
    textInactive: 'text-orange-200',
  },
  clubs: {
    bg: 'bg-emerald-950/90',
    bgActive: 'bg-emerald-700',
    border: 'border-emerald-400',
    label: 'Clubs',
    iconInactive: '#6ee7b7',
    iconActive: '#ffffff',
    textInactive: 'text-emerald-200',
  },
  spades: {
    bg: 'bg-slate-900/95',
    bgActive: 'bg-slate-600',
    border: 'border-slate-400',
    label: 'Spades',
    iconInactive: '#cbd5e1',
    iconActive: '#ffffff',
    textInactive: 'text-slate-200',
  },
}

function rankDisplay(rank: Rank): string {
  return formatRankDisplay(rank)
}

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit
}

function isCardTaken(rank: Rank, suit: Suit, usedCards: Card[], current: Card | null): boolean {
  const candidate = { rank, suit }
  if (current && sameCard(candidate, current)) return false
  return usedCards.some(c => sameCard(c, candidate))
}

export function CardPicker({ slotLabel, current, usedCards = [], onSelect, onClose }: CardPickerProps) {
  const [suit, setSuit] = useState<Suit>(current?.suit ?? 'hearts')

  const pickCard = (rank: Rank) => {
    onSelect({ rank, suit })
    onClose()
  }

  const theme = SUIT_THEMES[suit]
  const suitColor = SUIT_COLORS[suit]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-[96dvh] max-h-[96dvh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-4 py-3 bg-slate-900 flex items-center justify-between border-b border-white/10">
          <div>
            <p className="text-[10px] text-gold uppercase tracking-widest font-semibold">Pick a card</p>
            <h3 className="text-lg font-bold">{slotLabel}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-2xl leading-none flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Four suits — full-width colored tabs */}
        <div className="shrink-0 grid grid-cols-4 gap-0.5 p-1 bg-black/40">
          {SUITS.map(s => {
            const t = SUIT_THEMES[s]
            const active = suit === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSuit(s)}
                className={`flex flex-col items-center justify-center py-3 px-1 rounded-lg border-2 transition-all ${
                  active
                    ? `${t.bgActive} ${t.border} scale-[1.02] shadow-lg`
                    : `${t.bg} border-white/15 hover:border-white/30`
                }`}
              >
                <span
                  className="text-3xl leading-none drop-shadow-sm"
                  style={{ color: active ? t.iconActive : t.iconInactive }}
                >
                  {SUIT_SYMBOLS[s]}
                </span>
                <span className={`text-[9px] mt-1 font-semibold uppercase tracking-wide ${active ? 'text-white' : t.textInactive}`}>
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Preview */}
        <div className={`shrink-0 py-4 flex justify-center ${theme.bg} border-b border-white/10`}>
          <div className="w-24 h-32 rounded-xl bg-white shadow-xl flex flex-col items-center justify-center gap-1">
            <span className="text-3xl font-bold" style={{ color: suitColor }}>
              {current ? rankDisplay(current.rank) : '?'}
            </span>
            <span className="text-4xl" style={{ color: suitColor }}>{SUIT_SYMBOLS[suit]}</span>
            <p className="text-[10px] text-slate-400 mt-1">tap rank below</p>
          </div>
        </div>

        {/* All ranks — full grid, one tap to select */}
        <div className={`flex-1 overflow-y-auto p-4 ${theme.bg}`}>
          <p className="text-center text-xs text-white/50 uppercase tracking-wider mb-3">
            {SUIT_SYMBOLS[suit]} {theme.label}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {RANKS.map(rank => {
              const isCurrent = current?.rank === rank && current?.suit === suit
              const isTaken = isCardTaken(rank, suit, usedCards, current)
              const isDisabled = isTaken && !isCurrent
              return (
                <button
                  key={rank}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && pickCard(rank)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center font-bold transition-all ${
                    isDisabled
                      ? 'bg-white/10 opacity-35 cursor-not-allowed line-through decoration-white/40'
                      : isCurrent
                        ? 'bg-gold text-slate-900 ring-2 ring-white scale-105 shadow-lg active:scale-95'
                        : 'bg-white hover:bg-white/95 shadow-md hover:scale-105 active:scale-95'
                  }`}
                >
                  <span
                    className="text-2xl sm:text-3xl leading-none"
                    style={{ color: isCurrent ? undefined : suitColor }}
                  >
                    {rankDisplay(rank)}
                  </span>
                  <span
                    className="text-lg sm:text-xl mt-0.5"
                    style={{ color: isCurrent ? '#334155' : suitColor }}
                  >
                    {SUIT_SYMBOLS[suit]}
                  </span>
                  {(rank === 'A' || rank === 'J' || rank === 'Q' || rank === 'K') && (
                    <span className={`text-[8px] mt-0.5 ${isCurrent ? 'text-slate-600' : 'text-slate-400'}`}>
                      {RANK_LABELS[rank]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
