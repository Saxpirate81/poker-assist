import { useEffect, useState } from 'react'
import type { Card, GameRuleSetting, HandState } from '../types/poker'
import type { PokerGame } from '../types/poker'
import { PlayingCard, CardBack } from './PlayingCard'
import { CardPicker } from './CardPicker'
import { AiAssistant } from './AiAssistant'
import { PhotoCapture } from './PhotoCapture'
import { InlineBetStrip } from './InlineBetStrip'
import { formatMoneyWithSymbol } from '../lib/money'
import { CaribbeanSessionBar } from './CaribbeanSessionBar'
import {
  getDecisionRound,
  getSuggestedBetAmount,
  isPlayerHandComplete,
  ruleValue,
} from '../lib/handUtils'
import {
  type CaribbeanSession,
  loadCaribbeanSession,
  saveCaribbeanSession,
} from '../lib/caribbeanStud'

interface HandBoardProps {
  game: PokerGame
  state: HandState
  rules: GameRuleSetting[]
  onUpdateCards: (cards: Record<string, Card | null>) => void
  onUpdateRules: (rules: GameRuleSetting[]) => void
  onUpdateRound: (round: HandState['currentRound'], roundIndex: number) => void
  onLogAction: (action: string, amount?: number) => void
  onNewHand: () => void
  onBack: () => void
  caribbeanMode?: boolean
}

const ROUND_LABELS: Record<string, string> = {
  ante: 'Ante', preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn',
  river: 'River', raise: 'Raise / Fold', play: 'Play / Fold',
}

export function HandBoard({
  game,
  state,
  rules,
  onUpdateCards,
  onUpdateRules,
  onUpdateRound,
  onLogAction,
  onNewHand,
  onBack,
  caribbeanMode = false,
}: HandBoardProps) {
  const [pickerSlot, setPickerSlot] = useState<{ id: string; label: string } | null>(null)
  const [lastAdvice, setLastAdvice] = useState<{ action: string; amount?: number } | null>(null)
  const [session, setSession] = useState<CaribbeanSession | null>(
    caribbeanMode ? loadCaribbeanSession() : null
  )

  const allPlayerIds = game.playerSlots.map(s => s.id)
  const filledCount = allPlayerIds.filter(id => state.cards[id]).length
  const handComplete = isPlayerHandComplete(state, game)

  useEffect(() => {
    if (session) saveCaribbeanSession(session)
  }, [session])

  useEffect(() => {
    if (!handComplete) return
    const decisionRound = getDecisionRound(game)
    const decisionIdx = game.bettingRounds.indexOf(decisionRound)
    if (decisionIdx > 0 && state.roundIndex < decisionIdx) {
      onUpdateRound(decisionRound, decisionIdx)
    }
  }, [handComplete, game, state.roundIndex, onUpdateRound])

  const advanceRound = () => {
    const idx = game.bettingRounds.indexOf(state.currentRound)
    if (idx < game.bettingRounds.length - 1) {
      onUpdateRound(game.bettingRounds[idx + 1], idx + 1)
    }
  }

  const handleApplyBet = (amount: number) => {
    if (amount === 0) {
      onLogAction('fold')
      setLastAdvice({ action: 'fold' })
      if (session) {
        const ante = Number(ruleValue(rules, 'ante'))
        setSession(prev => prev ? {
          ...prev,
          handsPlayed: prev.handsPlayed + 1,
          folds: prev.folds + 1,
          netPnL: prev.netPnL - ante,
          bankroll: prev.bankroll - ante,
        } : prev)
      }
    } else {
      onLogAction('bet', amount)
      setLastAdvice({ action: 'bet', amount })
      if (session) {
        setSession(prev => prev ? { ...prev, raises: prev.raises + 1 } : prev)
      }
      advanceRound()
    }
  }

  const defaultBet = getSuggestedBetAmount(
    game,
    rules,
    game.bettingRounds.includes('raise') ? 'raise' : game.bettingRounds.includes('play') ? 'play' : 'bet'
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-32">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white">
          ← Exit
        </button>
        <span className="text-sm font-medium">{game.emoji} {game.name}</span>
        <button type="button" onClick={onNewHand} className="text-sm text-gold hover:text-gold-dark">
          New Hand
        </button>
      </div>

      {session && (
        <CaribbeanSessionBar
          session={session}
          onAdjustBankroll={delta => setSession(prev => prev ? { ...prev, bankroll: prev.bankroll + delta } : prev)}
        />
      )}

      {/* Felt table */}
      <div className="rounded-3xl bg-gradient-to-b from-felt to-felt-dark border-4 border-amber-900/40 shadow-2xl p-5 mb-3 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--color-gold)_0%,transparent_70%)] pointer-events-none" />

        {game.dealerSlots && game.dealerSlots.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-center text-white/40 uppercase tracking-wider mb-2">Dealer</p>
            <div className="flex justify-center gap-2 flex-wrap">
              {game.dealerSlots.map((slot, i) => (
                <div key={slot.id}>
                  {slot.hidden ? (
                    <CardBack size="sm" />
                  ) : (
                    <PlayingCard
                      card={state.cards[slot.id] ?? null}
                      label={slot.label}
                      onClick={() => setPickerSlot({ id: slot.id, label: slot.label })}
                      delay={i * 60}
                      size="sm"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {game.communitySlots && game.communitySlots.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-center text-white/40 uppercase tracking-wider mb-2">Community</p>
            <div className="flex justify-center gap-2 flex-wrap">
              {game.communitySlots.map((slot, i) => (
                <PlayingCard
                  key={slot.id}
                  card={state.cards[slot.id] ?? null}
                  label={slot.label}
                  onClick={() => setPickerSlot({ id: slot.id, label: slot.label })}
                  delay={i * 60}
                  size="sm"
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-center text-gold uppercase tracking-wider mb-2 font-semibold">
            Your Hand {handComplete && <span className="text-emerald-400">✓</span>}
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            {game.playerSlots.map((slot, i) => (
              <PlayingCard
                key={slot.id}
                card={state.cards[slot.id] ?? null}
                label={slot.label}
                onClick={() => setPickerSlot({ id: slot.id, label: slot.label })}
                delay={i * 80}
                size="md"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Ante/bet — always on this view, change on the fly */}
      <InlineBetStrip game={game} rules={rules} onChange={onUpdateRules} />

      {/* Round tabs */}
      <div className="flex gap-1 mb-3">
        {game.bettingRounds.map((r, i) => (
          <button
            key={r}
            type="button"
            onClick={() => onUpdateRound(r, i)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              state.currentRound === r
                ? 'bg-gold text-slate-900'
                : i < state.roundIndex
                  ? 'bg-white/10 text-white/60'
                  : 'bg-white/5 text-white/30'
            }`}
          >
            {ROUND_LABELS[r] ?? r}
          </button>
        ))}
      </div>

      <PhotoCapture
        expectedCount={game.playerSlots.length}
        slotIds={allPlayerIds}
        onCardsDetected={mapping => onUpdateCards({ ...state.cards, ...mapping })}
      />

      {/* AI coach */}
      <div className="mt-4 mb-2">
        <AiAssistant
          game={game}
          state={state}
          rules={rules}
          onApplyBet={handleApplyBet}
        />
      </div>

      {lastAdvice && (
        <p className="text-center text-xs text-white/40 mt-2">
          Last action: {lastAdvice.action}{lastAdvice.amount ? ` $${lastAdvice.amount}` : ''}
        </p>
      )}

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
        <div className="max-w-lg mx-auto">
          {caribbeanMode ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleApplyBet(0)}
                className="flex-1 py-3.5 rounded-xl bg-red-700 font-bold hover:bg-red-600 transition-colors"
              >
                Fold
              </button>
              <button
                type="button"
                onClick={() => handleApplyBet(defaultBet)}
                className="flex-[1.4] py-3.5 rounded-xl bg-gold text-slate-900 font-bold hover:bg-gold-dark transition-colors"
              >
                Raise {formatMoneyWithSymbol(defaultBet)}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleApplyBet(0)}
                className="flex-1 py-3 rounded-xl bg-red-900/60 border border-red-500/30 font-semibold text-sm hover:bg-red-900 transition-colors"
              >
                Fold
              </button>
              <button
                type="button"
                onClick={() => onLogAction('check')}
                className="flex-1 py-3 rounded-xl bg-white/10 border border-white/10 font-semibold text-sm hover:bg-white/20 transition-colors"
              >
                Check
              </button>
              <button
                type="button"
                onClick={() => handleApplyBet(defaultBet)}
                className="flex-1 py-3 rounded-xl bg-gold text-slate-900 font-bold text-sm hover:bg-gold-dark transition-colors"
              >
                Bet {formatMoneyWithSymbol(defaultBet)}
              </button>
            </div>
          )}
          <p className="text-center text-[10px] text-white/30 mt-2">
            {filledCount}/{game.playerSlots.length} cards · ante {formatMoneyWithSymbol(Number(ruleValue(rules, 'ante')))} · raise {formatMoneyWithSymbol(defaultBet)}
          </p>
        </div>
      </div>

      {pickerSlot && (
        <CardPicker
          slotLabel={pickerSlot.label}
          current={state.cards[pickerSlot.id] ?? null}
          onSelect={card => onUpdateCards({ ...state.cards, [pickerSlot.id]: card })}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  )
}
