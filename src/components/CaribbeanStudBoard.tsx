import { useEffect, useRef, useState } from 'react'
import type { Card, GameRuleSetting, HandState } from '../types/poker'
import type { PokerGame } from '../types/poker'
import { PlayingCard, CardBack } from './PlayingCard'
import { CardPicker } from './CardPicker'
import { AiAssistant } from './AiAssistant'
import { PhotoCapture } from './PhotoCapture'
import { AnteSetup } from './AnteSetup'
import { CaribbeanSessionBar } from './CaribbeanSessionBar'
import { CaribbeanPayTable } from './CaribbeanPayTable'
import { evaluateHand } from '../lib/pokerEval'
import { ruleValue } from '../lib/handUtils'
import {
  type CaribbeanHandRecord,
  type CaribbeanPhase,
  type CaribbeanSession,
  calculateOutcome,
  formatCardsShort,
  getRaiseReason,
  loadCaribbeanSession,
  saveCaribbeanSession,
  shouldCaribbeanRaise,
} from '../lib/caribbeanStud'

interface CaribbeanStudBoardProps {
  game: PokerGame
  state: HandState
  rules: GameRuleSetting[]
  onUpdateCards: (cards: Record<string, Card | null>) => void
  onUpdateRules: (rules: GameRuleSetting[]) => void
  onNewHand: () => void
  onBack: () => void
}

export function CaribbeanStudBoard({
  game,
  state,
  rules,
  onUpdateCards,
  onUpdateRules,
  onNewHand,
  onBack,
}: CaribbeanStudBoardProps) {
  const [phase, setPhase] = useState<CaribbeanPhase>('ante')
  const [pickerSlot, setPickerSlot] = useState<{ id: string; label: string } | null>(null)
  const [session, setSession] = useState<CaribbeanSession>(loadCaribbeanSession)
  const [lastAction, setLastAction] = useState<'raise' | 'fold' | null>(null)
  const [showdownResult, setShowdownResult] = useState<string | null>(null)
  const [revealDealer, setRevealDealer] = useState(false)
  const scoredRef = useRef(false)

  const ante = Number(ruleValue(rules, 'ante'))
  const raiseMult = Number(ruleValue(rules, 'raiseMultiplier'))
  const raiseAmt = ante * raiseMult
  const progressiveOn = !!ruleValue(rules, 'progressiveJackpot')
  const progressive = progressiveOn ? Number(ruleValue(rules, 'progressiveBet') || 1) : 0

  const playerIds = game.playerSlots.map(s => s.id)
  const dealerIds = (game.dealerSlots ?? []).map(s => s.id)
  const playerCards = playerIds.map(id => state.cards[id]).filter((c): c is Card => !!c)
  const dealerCards = dealerIds.map(id => state.cards[id]).filter((c): c is Card => !!c)
  const handComplete = playerCards.length === 5
  const playerEval = handComplete ? evaluateHand(playerCards) : null

  useEffect(() => {
    saveCaribbeanSession(session)
  }, [session])

  useEffect(() => {
    if (handComplete && phase === 'cards') {
      setPhase('decision')
    }
  }, [handComplete, phase])

  const persistSession = (update: Partial<CaribbeanSession>) => {
    setSession(prev => ({ ...prev, ...update }))
  }

  const handlePostAnte = () => {
    setPhase('cards')
  }

  const finalizeHand = (action: 'raise' | 'fold', dealer: Card[]) => {
    if (scoredRef.current) return
    scoredRef.current = true

    const outcome = calculateOutcome(playerCards, dealer, ante, raiseAmt, action, progressive)
    setShowdownResult(outcome.summary)

    const record: CaribbeanHandRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      playerCards: [...playerCards],
      dealerCards: dealer.length ? [...dealer] : undefined,
      playerHand: playerEval?.label ?? '',
      action,
      ante,
      raiseAmount: action === 'raise' ? raiseAmt : 0,
      progressiveBet: progressive,
      netResult: outcome.netResult,
      outcome: outcome.summary,
    }

    setSession(prev => ({
      ...prev,
      handsPlayed: prev.handsPlayed + 1,
      raises: action === 'raise' ? prev.raises + 1 : prev.raises,
      folds: action === 'fold' ? prev.folds + 1 : prev.folds,
      wins: outcome.playerWon ? prev.wins + 1 : prev.wins,
      losses: !outcome.playerWon ? prev.losses + 1 : prev.losses,
      netPnL: prev.netPnL + outcome.netResult,
      bankroll: prev.bankroll + outcome.netResult,
      handHistory: [record, ...prev.handHistory].slice(0, 50),
    }))
    setPhase('showdown')
  }

  const handleDecision = (action: 'raise' | 'fold') => {
    setLastAction(action)
    setRevealDealer(true)
    setShowdownResult(
      action === 'fold'
        ? 'Folded — log all 5 dealer cards (shown on table)'
        : `Raised $${raiseAmt} — tap dealer cards to score`
    )
  }

  useEffect(() => {
    if (revealDealer && lastAction && dealerCards.length === 5) {
      finalizeHand(lastAction, dealerCards)
    }
  }, [revealDealer, lastAction, dealerCards.length])

  const handleNextHand = () => {
    scoredRef.current = false
    setPhase('ante')
    setLastAction(null)
    setShowdownResult(null)
    setRevealDealer(false)
    onNewHand()
  }

  const shouldRaise = handComplete && shouldCaribbeanRaise(playerCards)
  const raiseReason = handComplete ? getRaiseReason(playerCards, playerEval) : ''

  const PHASE_STEPS: { id: CaribbeanPhase; label: string }[] = [
    { id: 'ante', label: '1. Ante' },
    { id: 'cards', label: '2. Cards' },
    { id: 'decision', label: '3. Raise?' },
    { id: 'showdown', label: '4. Done' },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-36">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white">← Exit</button>
        <span className="text-sm font-medium">🏝️ Caribbean Stud</span>
        <button type="button" onClick={handleNextHand} className="text-sm text-gold font-semibold hover:text-gold-dark">
          Next Hand →
        </button>
      </div>

      <CaribbeanSessionBar
        session={session}
        onAdjustBankroll={delta => persistSession({ bankroll: session.bankroll + delta })}
      />

      {/* Phase stepper — tap Ante to adjust before posting */}
      <div className="flex gap-1 mb-3">
        {PHASE_STEPS.map((s, i) => {
          const active = s.id === phase
          const done = PHASE_STEPS.findIndex(p => p.id === phase) > i
          const clickable = s.id === 'ante'
          return (
            <button
              key={s.id}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && setPhase('ante')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium text-center transition-colors ${
                active ? 'bg-gold text-slate-900' : done ? 'bg-emerald-900/40 text-emerald-300' : 'bg-white/5 text-white/30'
              } ${clickable ? 'cursor-pointer hover:ring-1 hover:ring-gold/50' : ''}`}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Ante for next hand — visible on showdown */}
      {phase === 'showdown' && (
        <div className="mb-3 px-3 py-3 rounded-xl bg-black/30 border border-gold/20">
          <p className="text-xs text-gold uppercase tracking-wider mb-2 font-semibold">Next hand ante</p>
          <AnteSetup
            compact
            rules={rules}
            onChange={onUpdateRules}
            raiseAmount={raiseAmt}
            raiseMult={raiseMult}
            progressive={progressive}
            progressiveOn={progressiveOn}
            onToggleProgressive={() => {}}
            onPostAnte={() => {}}
          />
        </div>
      )}

      <CaribbeanPayTable />

      {(phase === 'cards' || phase === 'decision') && (
        <div className="mb-4">
          <AiAssistant
            game={game}
            state={{ ...state, currentRound: phase === 'decision' ? 'raise' : 'ante' }}
            rules={rules}
            onApplyBet={amt => handleDecision(amt === 0 ? 'fold' : 'raise')}
          />
        </div>
      )}

      {phase === 'showdown' && showdownResult && (
        <div className={`mb-4 p-4 rounded-2xl border ${
          showdownResult.includes('win') || showdownResult.includes('won')
            ? 'border-emerald-500/40 bg-emerald-900/30'
            : showdownResult.includes('Fold')
              ? 'border-red-500/40 bg-red-900/30'
              : 'border-white/10 bg-black/30'
        }`}>
          <p className="font-bold text-sm">{showdownResult}</p>
          {playerEval && <p className="text-xs text-white/60 mt-1">Your hand: {playerEval.label}</p>}
        </div>
      )}

      {/* Table — ante setup lives ON the felt */}
      <div className="rounded-3xl bg-gradient-to-b from-felt to-felt-dark border-4 border-amber-900/40 shadow-2xl p-5 mb-4 relative">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--color-gold)_0%,transparent_70%)] pointer-events-none" />

        {phase === 'ante' ? (
          <AnteSetup
            rules={rules}
            onChange={onUpdateRules}
            raiseAmount={raiseAmt}
            raiseMult={raiseMult}
            progressive={progressive}
            progressiveOn={progressiveOn}
            onToggleProgressive={() => onUpdateRules(rules.map(r =>
              r.id === 'progressiveJackpot' ? { ...r, value: !r.value } : r
            ))}
            onPostAnte={handlePostAnte}
          />
        ) : (
          <>
        <div className="mb-6">
          <p className="text-xs text-center text-white/40 uppercase tracking-wider mb-2">
            Dealer {revealDealer ? '— tap to log' : '(face down)'}
          </p>
          <div className="flex justify-center gap-2">
            {(game.dealerSlots ?? []).map((slot, i) =>
              revealDealer ? (
                <PlayingCard
                  key={slot.id}
                  card={state.cards[slot.id] ?? null}
                  label={slot.label}
                  onClick={() => setPickerSlot({ id: slot.id, label: `Dealer ${slot.label}` })}
                  delay={i * 50}
                  size="sm"
                />
              ) : (
                <CardBack key={slot.id} size="sm" />
              )
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-center text-gold uppercase tracking-wider mb-1 font-semibold">
            Your Hand
            {handComplete && <span className="text-emerald-400 ml-1">✓</span>}
          </p>
          {playerEval && (
            <p className="text-center text-sm text-white/70 mb-2">{playerEval.label}</p>
          )}
          <div className="flex justify-center gap-2 flex-wrap">
            {game.playerSlots.map((slot, i) => (
              <PlayingCard
                key={slot.id}
                card={state.cards[slot.id] ?? null}
                label={slot.label}
                onClick={phase === 'cards' || phase === 'decision'
                  ? () => setPickerSlot({ id: slot.id, label: slot.label })
                  : undefined}
                delay={i * 80}
                size="md"
              />
            ))}
          </div>
        </div>
          </>
        )}
      </div>

      {phase === 'cards' && (
        <>
          <PhotoCapture
            expectedCount={5}
            slotIds={playerIds}
            onCardsDetected={mapping => onUpdateCards({ ...state.cards, ...mapping })}
          />
          <p className="text-center text-xs text-white/40 mt-2">
            {playerCards.length}/5 cards · {5 - playerCards.length} to go
          </p>
        </>
      )}

      {phase === 'decision' && handComplete && (
        <div className="mb-4 p-3 rounded-xl bg-black/30 border border-white/10 text-center text-sm text-white/70">
          {shouldRaise ? (
            <span className="text-emerald-400">{raiseReason || 'Raise for max value'}</span>
          ) : (
            <span className="text-red-400">Below raise threshold — fold saves ${raiseAmt}</span>
          )}
        </div>
      )}

      {/* Recent hands */}
      {session.handHistory.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-white/40 uppercase mb-2">Recent hands</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {session.handHistory.slice(0, 8).map(h => (
              <div key={h.id} className="flex justify-between text-xs text-white/60">
                <span>{formatCardsShort(h.playerCards)}</span>
                <span className={h.action === 'raise' ? 'text-emerald-400' : 'text-red-400'}>
                  {h.action === 'raise' ? `↑$${h.raiseAmount}` : 'fold'}
                  {h.netResult !== undefined && (
                    <span className={h.netResult >= 0 ? ' text-emerald-300' : ' text-red-300'}>
                      {' '}{h.netResult >= 0 ? '+' : ''}{h.netResult}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom actions — Caribbean-specific */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/98 to-transparent">
        <div className="max-w-lg mx-auto">
          {phase === 'decision' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDecision('fold')}
                className="flex-1 py-4 rounded-xl bg-red-700 font-bold text-base hover:bg-red-600 transition-colors"
              >
                Fold
              </button>
              <button
                type="button"
                onClick={() => handleDecision('raise')}
                className={`flex-[1.4] py-4 rounded-xl font-bold text-base transition-colors ${
                  shouldRaise
                    ? 'bg-gold text-slate-900 hover:bg-gold-dark shadow-lg shadow-gold/20'
                    : 'bg-amber-800/60 text-white/70 hover:bg-amber-800'
                }`}
              >
                Raise ${raiseAmt}
              </button>
            </div>
          )}
          {phase === 'showdown' && (
            <button
              type="button"
              onClick={handleNextHand}
              className="w-full py-4 rounded-xl bg-gold text-slate-900 font-bold text-lg hover:bg-gold-dark"
            >
              Next Hand →
            </button>
          )}
          {phase === 'cards' && !handComplete && (
            <p className="text-center text-xs text-white/40 py-2">
              Tap cards or snap a photo — coach activates at 5 cards
            </p>
          )}
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
