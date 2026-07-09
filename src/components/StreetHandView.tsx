import type { GameRulesKnowledge } from '../types/gameRulesKnowledge'
import { useEffect, useState } from 'react'
import type { Card, GameRuleSetting, HandState } from '../types/poker'
import type { PokerGame } from '../types/poker'
import { PlayingCard } from './PlayingCard'
import { CardPicker } from './CardPicker'
import { AiAssistant } from './AiAssistant'
import { PhotoCapture } from './PhotoCapture'
import { GameHandShell } from './GameHandShell'
import { evaluateHand, evaluateOmahaBestHand } from '../lib/pokerEval'
import { getCommunityCards, getPlayerCards, ruleValue } from '../lib/handUtils'
import {
  communitySlotEnabled,
  getStreetStep,
  roundForStep,
  streetLabel,
  type StreetStep,
} from '../lib/holdemFlow'
import {
  applySessionResult,
  loadGameSession,
  saveGameSession,
} from '../lib/gameSession'

interface StreetHandViewProps {
  game: PokerGame
  state: HandState
  rules: GameRuleSetting[]
  rulesKnowledge?: GameRulesKnowledge
  onUpdateCards: (cards: Record<string, Card | null>) => void
  onUpdateRound: (round: HandState['currentRound'], roundIndex: number) => void
  onNewHand: () => void
  onBack: () => void
  onOpenSettings?: () => void
}

export function StreetHandView({
  game,
  state,
  rules,
  rulesKnowledge,
  onUpdateCards,
  onUpdateRound,
  onNewHand,
  onBack,
  onOpenSettings,
}: StreetHandViewProps) {
  const [pickerSlot, setPickerSlot] = useState<{ id: string; label: string } | null>(null)
  const [session, setSession] = useState(() => loadGameSession(game.id))
  const [lastAction, setLastAction] = useState<string | null>(null)

  const holeCards = getPlayerCards(state, game)
  const community = getCommunityCards(state, game)
  const holeNeeded = game.id === 'omaha' ? 4 : 2
  const holeComplete = holeCards.length >= holeNeeded
  const step = getStreetStep(community.length, holeComplete)

  const bestHand = game.id === 'omaha' && holeCards.length === 4 && community.length >= 3
    ? evaluateOmahaBestHand(holeCards, community)
    : holeCards.length >= 2 && community.length >= 3
      ? evaluateHand([...holeCards, ...community])
      : holeCards.length === holeNeeded
        ? evaluateHand(holeCards)
        : null

  useEffect(() => { saveGameSession(game.id, session) }, [game.id, session])

  useEffect(() => {
    const round = roundForStep(step)
    const idx = game.bettingRounds.indexOf(round)
    if (idx >= 0 && state.currentRound !== round) {
      onUpdateRound(round, idx)
    }
  }, [step, game.bettingRounds, state.currentRound, onUpdateRound])

  const bb = Number(ruleValue(rules, 'bigBlind'))

  const handleFold = () => {
    setLastAction('fold')
    setSession(prev => applySessionResult(prev, -bb, 'fold'))
  }

  const canPickHole = (slotId: string): boolean => {
    return step === 'preflop' || (step !== 'done' && !state.cards[slotId])
  }

  const canPickCommunity = (slotId: string): boolean => {
    return communitySlotEnabled(slotId, step)
  }

  const stepHint =
    step === 'preflop' ? `${holeCards.length}/${holeNeeded} hole cards`
      : step === 'done' ? (bestHand ? bestHand.label : 'Hand complete')
        : `${community.length}/5 board · ${bestHand?.label ?? streetLabel(step)}`

  const felt = (
    <div className="rounded-3xl bg-gradient-to-b from-felt to-felt-dark border-4 border-amber-900/40 shadow-2xl p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--color-gold)_0%,transparent_70%)] pointer-events-none" />

      {game.communitySlots && game.communitySlots.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-center text-white/40 uppercase tracking-wider mb-2">Board</p>
          <div className="flex justify-center gap-2 flex-wrap">
            {game.communitySlots.map((slot, i) => (
              <PlayingCard
                key={slot.id}
                card={state.cards[slot.id] ?? null}
                label={slot.label}
                onClick={canPickCommunity(slot.id) ? () => setPickerSlot({ id: slot.id, label: slot.label }) : undefined}
                delay={i * 60}
                size="sm"
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs text-center text-gold uppercase tracking-wider mb-2 font-semibold">
          Your Hand {bestHand && <span className="text-emerald-400">· {bestHand.label}</span>}
        </p>
        <div className="flex justify-center gap-2 flex-wrap">
          {game.playerSlots.map((slot, i) => (
            <PlayingCard
              key={slot.id}
              card={state.cards[slot.id] ?? null}
              label={slot.label}
              onClick={canPickHole(slot.id) ? () => setPickerSlot({ id: slot.id, label: slot.label }) : undefined}
              delay={i * 80}
              size="md"
            />
          ))}
        </div>
      </div>
    </div>
  )

  const footer = (
    <div className="flex gap-2">
      <button type="button" onClick={handleFold} className="flex-1 py-3 rounded-xl bg-red-900/60 border border-red-500/30 font-semibold text-sm hover:bg-red-900">Fold</button>
      <button type="button" onClick={() => setLastAction('check')} className="flex-1 py-3 rounded-xl bg-white/10 border border-white/10 font-semibold text-sm hover:bg-white/20">Check</button>
      <button type="button" onClick={() => setLastAction(`bet ${bb * 2}`)} className="flex-1 py-3 rounded-xl bg-gold text-slate-900 font-bold text-sm hover:bg-gold-dark">Bet</button>
    </div>
  )

  return (
    <>
      <GameHandShell
        game={game}
        stepTitle={streetLabel(step as StreetStep)}
        stepHint={lastAction ? `Last: ${lastAction}` : stepHint}
        session={session}
        onBack={onBack}
        onNewHand={onNewHand}
        onOpenSettings={onOpenSettings}
        betStrip={
          <div className="flex gap-1">
            {game.bettingRounds.map((r, i) => (
              <button
                key={r}
                type="button"
                onClick={() => onUpdateRound(r, i)}
                className={`flex-1 py-1 rounded text-[10px] font-medium ${
                  state.currentRound === r ? 'bg-gold text-slate-900' : 'bg-white/10 text-white/50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        }
        felt={
          <>
            <PhotoCapture
              expectedCount={holeNeeded}
              slotIds={game.playerSlots.map(s => s.id)}
              onCardsDetected={mapping => onUpdateCards({ ...state.cards, ...mapping })}
            />
            {felt}
          </>
        }
        coach={<AiAssistant game={game} state={state} rules={rules} rulesKnowledge={rulesKnowledge} onApplyBet={amt => { if (amt === 0) handleFold(); else setLastAction(`bet ${amt}`) }} />}
        footer={footer}
      />
      {pickerSlot && (
        <CardPicker
          slotLabel={pickerSlot.label}
          current={state.cards[pickerSlot.id] ?? null}
          onSelect={card => onUpdateCards({ ...state.cards, [pickerSlot.id]: card })}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </>
  )
}

/** Texas Hold'em wrapper */
export function HoldemHandView(props: Omit<StreetHandViewProps, 'game'> & { game: PokerGame }) {
  return <StreetHandView {...props} />
}

/** Omaha wrapper */
export function OmahaHandView(props: Omit<StreetHandViewProps, 'game'> & { game: PokerGame }) {
  return <StreetHandView {...props} />
}
