import type { GameRulesKnowledge } from '../types/gameRulesKnowledge'
import { useEffect, useRef, useState } from 'react'
import type { Card, GameRuleSetting, HandState } from '../types/poker'
import type { PokerGame } from '../types/poker'
import { PlayingCard } from './PlayingCard'
import { CardPicker } from './CardPicker'
import { AiAssistant } from './AiAssistant'
import { PhotoCapture } from './PhotoCapture'
import { GameHandShell } from './GameHandShell'
import { evaluateHand } from '../lib/pokerEval'
import { ruleValue } from '../lib/handUtils'
import { formatMoneyWithSymbol } from '../lib/money'
import {
  calculateVideoPokerOutcome,
  getVideoPokerStep,
  suggestVideoPokerHolds,
  type VideoPokerStep,
} from '../lib/videoPoker'
import {
  applySessionResult,
  loadGameSession,
  saveGameSession,
} from '../lib/gameSession'

interface VideoPokerHandViewProps {
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

const STEP_LABELS: Record<VideoPokerStep, string> = {
  deal: '1 · Deal',
  hold: '2 · Hold / discard',
  draw: '3 · Draw',
  done: 'Done',
}

const SLOT_IDS = ['p1', 'p2', 'p3', 'p4', 'p5']

export function VideoPokerHandView({
  game,
  state,
  rules,
  rulesKnowledge,
  onUpdateCards,
  onUpdateRules,
  onNewHand,
  onBack,
  onOpenSettings,
}: VideoPokerHandViewProps) {
  const [pickerSlot, setPickerSlot] = useState<{ id: string; label: string } | null>(null)
  const [session, setSession] = useState(() => loadGameSession('video-poker'))
  const [holds, setHolds] = useState<Set<number>>(new Set())
  const [holdsConfirmed, setHoldsConfirmed] = useState(false)
  const [drawComplete, setDrawComplete] = useState(false)
  const [resultText, setResultText] = useState<string | null>(null)
  const scoredRef = useRef(false)

  const cards = SLOT_IDS.map(id => state.cards[id]).filter((c): c is Card => !!c)
  const step = getVideoPokerStep(cards.length, holdsConfirmed, drawComplete)
  const bet = Number(ruleValue(rules, 'bet'))
  const variant = String(ruleValue(rules, 'variant'))
  const handEval = cards.length === 5 ? evaluateHand(cards) : null

  useEffect(() => { saveGameSession('video-poker', session) }, [session])

  useEffect(() => {
    if (step === 'hold' && holds.size === 0 && cards.length === 5) {
      setHolds(suggestVideoPokerHolds(cards))
    }
  }, [step, cards.length])

  useEffect(() => {
    if (step !== 'done' || scoredRef.current || cards.length !== 5) return
    const outcome = calculateVideoPokerOutcome(cards, bet, variant)
    scoredRef.current = true
    setResultText(outcome.summary)
    setSession(prev => applySessionResult(
      prev,
      outcome.netResult,
      outcome.netResult > 0 ? 'win' : 'loss'
    ))
  }, [step, cards, bet, variant])

  useEffect(() => {
    if (holdsConfirmed && cards.length === 5) {
      const allDrawn = SLOT_IDS.every((id, i) => holds.has(i) || state.cards[id])
      if (allDrawn) setDrawComplete(true)
    }
  }, [state.cards, holdsConfirmed, holds, cards.length])

  const handleNextHand = () => {
    scoredRef.current = false
    setHolds(new Set())
    setHoldsConfirmed(false)
    setDrawComplete(false)
    setResultText(null)
    onNewHand()
  }

  const toggleHold = (index: number) => {
    if (step !== 'hold') return
    setHolds(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const confirmHolds = () => {
    setHoldsConfirmed(true)
    const nextCards = { ...state.cards }
    SLOT_IDS.forEach((id, i) => {
      if (!holds.has(i)) nextCards[id] = null
    })
    onUpdateCards(nextCards)
  }

  const canPick = (slotId: string): boolean => {
    const idx = SLOT_IDS.indexOf(slotId)
    if (step === 'deal') return true
    if (step === 'draw' && holdsConfirmed && !holds.has(idx)) return true
    return false
  }

  const aiState: HandState = { ...state, currentRound: 'play' }

  const stepHint =
    step === 'deal' ? `${cards.length}/5 cards — bet ${formatMoneyWithSymbol(bet)}`
      : step === 'hold' ? 'Tap cards to hold, then confirm'
        : step === 'draw' ? 'Replace discarded cards'
          : (resultText ?? handEval?.label ?? 'Hand complete')

  const felt = (
    <div className="rounded-3xl bg-gradient-to-b from-felt to-felt-dark border-4 border-amber-900/40 shadow-2xl p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--color-gold)_0%,transparent_70%)] pointer-events-none" />
      <p className="text-xs text-center text-gold uppercase tracking-wider mb-3 font-semibold">
        {handEval ? handEval.label : `${cards.length}/5 cards`}
      </p>
      <div className="flex justify-center gap-2 flex-wrap">
        {game.playerSlots.map((slot, i) => (
          <div key={slot.id} className="relative">
            <PlayingCard
              card={state.cards[slot.id] ?? null}
              label={slot.label}
              selected={step === 'hold' && holds.has(i)}
              onClick={
                step === 'hold' && state.cards[slot.id]
                  ? () => toggleHold(i)
                  : canPick(slot.id)
                    ? () => setPickerSlot({ id: slot.id, label: slot.label })
                    : undefined
              }
              delay={i * 80}
              size="md"
            />
            {step === 'hold' && holds.has(i) && state.cards[slot.id] && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-gold text-slate-900 px-1.5 rounded">HOLD</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const footer =
    step === 'hold' ? (
      <button type="button" onClick={confirmHolds} className="w-full py-3.5 rounded-xl bg-gold text-slate-900 font-bold hover:bg-gold-dark">
        Draw ({5 - holds.size} card{5 - holds.size !== 1 ? 's' : ''})
      </button>
    ) : step === 'done' ? (
      <button type="button" onClick={handleNextHand} className="w-full py-3.5 rounded-xl bg-gold text-slate-900 font-bold hover:bg-gold-dark">Next Hand</button>
    ) : (
      <p className="text-center text-xs text-white/40 py-2">
        Bet {formatMoneyWithSymbol(bet)} · {variant === 'deuces-wild' ? 'Deuces Wild' : 'Jacks or Better'}
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
        betStrip={
          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/50">Bet</span>
            <span className="text-gold font-bold">{formatMoneyWithSymbol(bet)}</span>
            <select
              className="ml-auto bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={variant}
              onChange={e => onUpdateRules(rules.map(r => r.id === 'variant' ? { ...r, value: e.target.value } : r))}
            >
              <option value="jacks-or-better">Jacks or Better</option>
              <option value="deuces-wild">Deuces Wild</option>
            </select>
          </div>
        }
        felt={
          <>
            {step === 'deal' && (
              <PhotoCapture
                prominent
                expectedCount={5}
                slotIds={SLOT_IDS}
                onCardsDetected={mapping => onUpdateCards({ ...state.cards, ...mapping })}
              />
            )}
            {felt}
          </>
        }
        coach={(step === 'deal' || step === 'hold') && (
          <AiAssistant game={game} state={aiState} rules={rules} rulesKnowledge={rulesKnowledge} />
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
