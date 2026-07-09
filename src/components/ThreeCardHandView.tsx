import { useEffect, useRef, useState } from 'react'
import type { Card, GameRuleSetting, HandState } from '../types/poker'
import type { PokerGame } from '../types/poker'
import type { GameRulesKnowledge } from '../types/gameRulesKnowledge'
import { PlayingCard, CardBack } from './PlayingCard'
import { CardPicker } from './CardPicker'
import { AiAssistant } from './AiAssistant'
import { PhotoCapture } from './PhotoCapture'
import { InlineBetStrip } from './InlineBetStrip'
import { GameHandShell } from './GameHandShell'
import { evaluateThreeCard } from '../lib/pokerEval'
import { getSuggestedBetAmount, ruleValue } from '../lib/handUtils'
import { formatMoneyWithSymbol } from '../lib/money'
import {
  getThreeCardStep,
  getThreeCardPlayerCards,
  getThreeCardDealerCards,
  type ThreeCardStep,
} from '../lib/threeCardFlow'
import {
  calculateThreeCardOutcome,
  meetsThreeCardPlayThreshold,
} from '../lib/threeCardPoker'
import {
  applySessionResult,
  loadGameSession,
  saveGameSession,
} from '../lib/gameSession'

interface ThreeCardHandViewProps {
  game: PokerGame
  state: HandState
  rules: GameRuleSetting[]
  rulesKnowledge?: GameRulesKnowledge
  onUpdateCards: (cards: Record<string, Card | null>) => void
  onUpdateRules: (rules: GameRuleSetting[]) => void
  onNewHand: () => void
  onBack: () => void
  onOpenSettings?: () => void
}

const STEP_LABELS: Record<ThreeCardStep, string> = {
  player: '1 · Your cards',
  bet: '2 · Play or fold',
  showdown: '3 · Dealer cards',
  done: 'Done',
}

function cardKey(c: Card): string {
  return `${c.rank}${c.suit[0]}`
}

function findDupes(cards: Record<string, Card | null>): string | null {
  const seen = new Map<string, string>()
  for (const [id, c] of Object.entries(cards)) {
    if (!c) continue
    const k = cardKey(c)
    if (seen.has(k)) return `Duplicate ${k} in ${seen.get(k)} and ${id}`
    seen.set(k, id)
  }
  return null
}

export function ThreeCardHandView({
  game,
  state,
  rules,
  rulesKnowledge,
  onUpdateCards,
  onUpdateRules,
  onNewHand,
  onBack,
  onOpenSettings,
}: ThreeCardHandViewProps) {
  const [pickerSlot, setPickerSlot] = useState<{ id: string; label: string } | null>(null)
  const [session, setSession] = useState(() => loadGameSession('three-card-poker'))
  const [betAction, setBetAction] = useState<'play' | 'fold' | null>(null)
  const [resultText, setResultText] = useState<string | null>(null)
  const scoredRef = useRef(false)

  const playerCards = getThreeCardPlayerCards(state.cards)
  const dealerCards = getThreeCardDealerCards(state.cards)
  const step = getThreeCardStep(playerCards.length, betAction, dealerCards.length)
  const dupes = findDupes(state.cards)

  const ante = Number(ruleValue(rules, 'ante'))
  const playAmt = getSuggestedBetAmount(game, rules, 'play')
  const pairPlusEnabled = !!ruleValue(rules, 'pairPlus')
  const pairPlusBet = pairPlusEnabled ? ante : 0
  const playerEval = playerCards.length === 3 ? evaluateThreeCard(playerCards) : null
  const shouldPlay = playerCards.length === 3 && meetsThreeCardPlayThreshold(playerCards)

  useEffect(() => { saveGameSession('three-card-poker', session) }, [session])

  const finalizeHand = () => {
    if (scoredRef.current || !betAction) return
    const outcome = calculateThreeCardOutcome(
      playerCards,
      dealerCards,
      ante,
      playAmt,
      betAction,
      pairPlusBet
    )
    if (!outcome.valid) return
    scoredRef.current = true
    setResultText(outcome.summary)
    setSession(prev => applySessionResult(
      prev,
      outcome.netResult,
      betAction === 'fold' ? 'fold' : outcome.playerWon ? 'win' : 'loss'
    ))
  }

  useEffect(() => {
    if (betAction === 'fold') finalizeHand()
    if (betAction === 'play' && dealerCards.length === 3) finalizeHand()
  }, [betAction, dealerCards.length])

  const handleBet = (action: 'play' | 'fold') => {
    if (playerCards.length < 3) return
    if (dupes) return
    setBetAction(action)
  }

  const handleNextHand = () => {
    scoredRef.current = false
    setBetAction(null)
    setResultText(null)
    onNewHand()
  }

  const canPick = (slotId: string): boolean => {
    if (['p1', 'p2', 'p3'].includes(slotId)) return step === 'player' || step === 'bet'
    if (['d1', 'd2', 'd3'].includes(slotId)) return step === 'showdown'
    return false
  }

  const aiState: HandState = {
    ...state,
    currentRound: step === 'bet' ? 'play' : 'ante',
  }

  const stepHint =
    step === 'player' ? `${playerCards.length}/3 cards — tap or photo`
      : step === 'bet' ? (shouldPlay ? `${playerEval?.label} — play ${formatMoneyWithSymbol(playAmt)}` : `Fold saves ${formatMoneyWithSymbol(playAmt)}`)
        : step === 'showdown' ? `${dealerCards.length}/3 dealer cards`
          : (resultText ?? 'Hand complete')

  const felt = (
    <div className="rounded-3xl bg-gradient-to-b from-felt to-felt-dark border-4 border-amber-900/40 shadow-2xl p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--color-gold)_0%,transparent_70%)] pointer-events-none" />

      {(step === 'showdown' || step === 'done') && (
        <div className="mb-5">
          <p className="text-xs text-center text-white/40 uppercase tracking-wider mb-2">Dealer</p>
          <div className="flex justify-center gap-2">
            {game.dealerSlots!.map((slot, i) => (
              <div key={slot.id}>
                {step === 'showdown' && !state.cards[slot.id] ? (
                  <CardBack size="sm" />
                ) : (
                  <PlayingCard
                    card={state.cards[slot.id] ?? null}
                    label={slot.label}
                    onClick={canPick(slot.id) ? () => setPickerSlot({ id: slot.id, label: slot.label }) : undefined}
                    delay={i * 60}
                    size="sm"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs text-center text-gold uppercase tracking-wider mb-2 font-semibold">
          Your Hand {playerCards.length === 3 && <span className="text-emerald-400">✓ {playerEval?.label}</span>}
        </p>
        <div className="flex justify-center gap-2">
          {game.playerSlots.map((slot, i) => (
            <PlayingCard
              key={slot.id}
              card={state.cards[slot.id] ?? null}
              label={slot.label}
              onClick={canPick(slot.id) ? () => setPickerSlot({ id: slot.id, label: slot.label }) : undefined}
              delay={i * 80}
              size="md"
            />
          ))}
        </div>
      </div>
    </div>
  )

  const footer =
    step === 'bet' ? (
      <div className="flex gap-2">
        <button type="button" onClick={() => handleBet('fold')} className="flex-1 py-3.5 rounded-xl bg-red-700 font-bold hover:bg-red-600">Fold</button>
        <button type="button" onClick={() => handleBet('play')} disabled={playerCards.length < 3} className="flex-[1.4] py-3.5 rounded-xl bg-gold text-slate-900 font-bold hover:bg-gold-dark disabled:opacity-40">
          Play {formatMoneyWithSymbol(playAmt)}
        </button>
      </div>
    ) : step === 'done' ? (
      <button type="button" onClick={handleNextHand} className="w-full py-3.5 rounded-xl bg-gold text-slate-900 font-bold hover:bg-gold-dark">Next Hand</button>
    ) : (
      <p className="text-center text-xs text-white/40 py-2">
        {step === 'player' ? 'Enter 3 cards to continue' : 'Enter dealer cards to score'}
      </p>
    )

  return (
    <>
      <GameHandShell
        game={game}
        stepTitle={STEP_LABELS[step]}
        stepHint={stepHint}
        session={session}
        onBack={onBack}
        onNewHand={handleNextHand}
        onOpenSettings={onOpenSettings}
        alert={dupes}
        betStrip={<InlineBetStrip game={game} rules={rules} onChange={onUpdateRules} compact />}
        felt={
          <>
            {(step === 'player' || step === 'bet') && (
              <PhotoCapture
                prominent
                expectedCount={3}
                slotIds={['p1', 'p2', 'p3']}
                onCardsDetected={mapping => onUpdateCards({ ...state.cards, ...mapping })}
              />
            )}
            {felt}
          </>
        }
        coach={(step === 'player' || step === 'bet') && (
          <AiAssistant game={game} state={aiState} rules={rules} rulesKnowledge={rulesKnowledge} onApplyBet={amt => handleBet(amt > 0 ? 'play' : 'fold')} />
        )}
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
