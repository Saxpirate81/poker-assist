import { useEffect, useRef, useState } from 'react'
import type { Card, GameRuleSetting, HandState, AiAdvice } from '../types/poker'
import type { PokerGame } from '../types/poker'
import type { LoggedCaribbeanHand } from '../types/handLog'
import { PlayingCard, CardBack } from './PlayingCard'
import { CardPicker } from './CardPicker'
import { CaribbeanAnalysisBar } from './CaribbeanAnalysisBar'
import { PhotoCapture } from './PhotoCapture'
import { InlineBetStrip } from './InlineBetStrip'
import { CaribbeanSessionBar } from './CaribbeanSessionBar'
import { HandTrendsPanel } from './HandTrendsPanel'
import { evaluateHand, formatRankDisplay } from '../lib/pokerEval'
import { getSuggestedBetAmount, ruleValue } from '../lib/handUtils'
import { getAiAdvice } from '../lib/aiService'
import { getAiProvider, isSupabaseConfigured } from '../lib/config'
import { formatMoneyWithSymbol } from '../lib/money'
import {
  type CaribbeanSession,
  calculateOutcome,
  dealerQualifies,
  loadCaribbeanSession,
  saveCaribbeanSession,
} from '../lib/caribbeanStud'
import { getCaribbeanStep, getRaiseReason, shouldCaribbeanRaise, type CaribbeanStep } from '../lib/caribbeanFlow'
import { analyzeCaribbeanBet } from '../lib/caribbeanOdds'
import {
  computeTrends,
  didFollowAi,
  fetchCaribbeanHands,
  saveCaribbeanHand,
  deleteCaribbeanHand,
  clearAllCaribbeanHands,
  rebuildSessionFromHands,
} from '../lib/handLogService'

interface CaribbeanHandViewProps {
  game: PokerGame
  state: HandState
  rules: GameRuleSetting[]
  onUpdateCards: (cards: Record<string, Card | null>) => void
  onUpdateRules: (rules: GameRuleSetting[]) => void
  onNewHand: () => void
  onBack: () => void
  onOpenSettings?: () => void
}

const STEP_LABELS: Record<CaribbeanStep, string> = {
  'dealer-up': '1 · Dealer up-card',
  'player': '2 · Your cards',
  'bet': '3 · Raise or fold',
  'showdown': '4 · Dealer rest',
  'done': 'Done',
}

export function CaribbeanHandView({
  game,
  state,
  rules,
  onUpdateCards,
  onUpdateRules,
  onNewHand,
  onBack,
  onOpenSettings,
}: CaribbeanHandViewProps) {
  const [pickerSlot, setPickerSlot] = useState<{ id: string; label: string } | null>(null)
  const [session, setSession] = useState<CaribbeanSession>(loadCaribbeanSession)
  const [betAction, setBetAction] = useState<'raise' | 'fold' | null>(null)
  const [resultText, setResultText] = useState<string | null>(null)
  const [loggedHands, setLoggedHands] = useState<LoggedCaribbeanHand[]>([])
  const [lastAiAdvice, setLastAiAdvice] = useState<(AiAdvice & { provider?: string }) | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [photoRefresh, setPhotoRefresh] = useState(0)
  const scoredRef = useRef(false)
  const aiFetchedForHand = useRef(false)

  const dealerUp = state.cards['d1'] ?? null
  const playerIds = game.playerSlots.map(s => s.id)
  const playerCards = playerIds.map(id => state.cards[id]).filter((c): c is Card => !!c)
  const dealerSlotIds = ['d1', 'd2', 'd3', 'd4', 'd5']
  const dealerRestIds = ['d2', 'd3', 'd4', 'd5']
  const dealerRest = dealerRestIds.map(id => state.cards[id]).filter((c): c is Card => !!c)
  const step = getCaribbeanStep(dealerUp, playerCards, betAction, dealerRest.length)

  const ante = Number(ruleValue(rules, 'ante'))
  const raiseMult = Number(ruleValue(rules, 'raiseMultiplier'))
  const raiseAmt = getSuggestedBetAmount(game, rules, 'raise')
  const progressive = ruleValue(rules, 'progressiveJackpot') ? Number(ruleValue(rules, 'progressiveBet') || 1) : 0
  const playerEval = playerCards.length === 5 ? evaluateHand(playerCards) : null
  const allDealerCards = dealerUp && dealerRest.length === 4
    ? [dealerUp, ...dealerRest]
    : dealerUp && dealerRest.length > 0
      ? [dealerUp, ...dealerRest]
      : dealerUp
        ? [dealerUp]
        : []
  const dealerEval = allDealerCards.length === 5 ? evaluateHand(allDealerCards) : null
  const dealerQualifiesHand = allDealerCards.length === 5 ? dealerQualifies(allDealerCards) : false
  const shouldRaise = playerCards.length === 5 && shouldCaribbeanRaise(playerCards, dealerUp)
  const raiseReason = playerCards.length === 5 ? getRaiseReason(playerCards, playerEval, dealerUp) : ''
  const trends = computeTrends(loggedHands)
  const betAnalysis = analyzeCaribbeanBet(playerCards, dealerUp, ante, raiseAmt, progressive)
  const cardsReady = playerCards.length === 5 && !!dealerUp

  useEffect(() => { saveCaribbeanSession(session) }, [session])
  useEffect(() => { fetchCaribbeanHands().then(setLoggedHands) }, [])

  const aiState: HandState = {
    ...state,
    currentRound: step === 'bet' ? 'raise' : 'ante',
  }

  // Fetch AI recommendation once hand is complete (5 player cards + dealer up)
  useEffect(() => {
    if (playerCards.length !== 5 || !dealerUp || aiFetchedForHand.current) return
    if (step !== 'player' && step !== 'bet') return

    aiFetchedForHand.current = true
    setAiLoading(true)
    getAiAdvice(game, aiState, rules).then(advice => {
      setLastAiAdvice(advice)
      setAiLoading(false)
    })
  }, [playerCards.length, dealerUp, step, photoRefresh])

  const finalizeHand = async (action: 'raise' | 'fold', allDealer: Card[]) => {
    if (scoredRef.current) return
    scoredRef.current = true

    const outcome = calculateOutcome(playerCards, allDealer, ante, raiseAmt, action, progressive)
    const dealerEval = allDealer.length === 5 ? evaluateHand(allDealer) : null
    setResultText(outcome.summary)

    const advice = lastAiAdvice
    const followed = didFollowAi(advice, action)

    await saveCaribbeanHand({
      dealerUpCard: dealerUp,
      playerCards: [...playerCards],
      dealerCards: allDealer,
      playerHand: playerEval?.label ?? '',
      dealerHand: dealerEval?.label ?? '',
      ante,
      raiseMultiplier: raiseMult,
      raiseAmount: action === 'raise' ? raiseAmt : 0,
      progressiveBet: progressive,
      action,
      aiAdvice: advice,
      aiProvider: advice?.provider ?? getAiProvider(),
      followedAi: followed,
      netResult: outcome.netResult,
      outcomeSummary: outcome.summary,
      dealerQualified: allDealer.length === 5 ? dealerQualifies(allDealer) : false,
      playerWon: outcome.playerWon,
    })

    const hands = await fetchCaribbeanHands()
    setLoggedHands(hands)

    setSession(prev => ({
      ...prev,
      handsPlayed: prev.handsPlayed + 1,
      raises: action === 'raise' ? prev.raises + 1 : prev.raises,
      folds: action === 'fold' ? prev.folds + 1 : prev.folds,
      wins: outcome.playerWon ? prev.wins + 1 : prev.wins,
      losses: !outcome.playerWon ? prev.losses + 1 : prev.losses,
      netPnL: prev.netPnL + outcome.netResult,
      bankroll: prev.bankroll + outcome.netResult,
    }))
  }

  const handleBet = (action: 'raise' | 'fold') => {
    setBetAction(action)
  }

  useEffect(() => {
    if (betAction && dealerRest.length === 4 && dealerUp) {
      finalizeHand(betAction, [dealerUp, ...dealerRest])
    }
  }, [betAction, dealerRest.length, dealerUp])

  const handleNextHand = () => {
    scoredRef.current = false
    aiFetchedForHand.current = false
    setBetAction(null)
    setResultText(null)
    setLastAiAdvice(null)
    onNewHand()
  }

  const handleDeleteHand = async (id: string) => {
    const hands = await deleteCaribbeanHand(id)
    setLoggedHands(hands)
    setSession(rebuildSessionFromHands(hands))
  }

  const handleClearAllHands = async () => {
    if (!window.confirm('Delete all logged hands? Session stats will reset.')) return
    const hands = await clearAllCaribbeanHands()
    setLoggedHands(hands)
    setSession(rebuildSessionFromHands(hands))
  }

  const canPick = (slotId: string): boolean => {
    if (slotId === 'd1') return step === 'dealer-up' || step === 'player' || step === 'bet'
    if (dealerRestIds.includes(slotId)) return step === 'showdown'
    if (playerIds.includes(slotId)) return step === 'player' || step === 'bet'
    return false
  }

  const showAnalysis = step === 'player' || step === 'bet'

  const playerCardsUsed = playerIds.map(id => state.cards[id]).filter((c): c is Card => !!c)
  const dealerCardsUsed = dealerSlotIds.map(id => state.cards[id]).filter((c): c is Card => !!c)
  const handlePhotoCards = (mapping: Record<string, Card>) => {
    onUpdateCards({ ...state.cards, ...mapping })
    aiFetchedForHand.current = false
    setLastAiAdvice(null)
    setPhotoRefresh(n => n + 1)
  }

  const tableSlotIds = ['d1', ...playerIds]

  const pickerUsedCards = pickerSlot
    ? (dealerSlotIds.includes(pickerSlot.id) ? dealerCardsUsed : playerCardsUsed)
    : []

  return (
    <div className="max-w-lg mx-auto px-4 py-3 pb-52 flex flex-col min-h-dvh">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white">← Exit</button>
        <span className="text-sm font-bold">🏝️ Caribbean Stud</span>
        <button type="button" onClick={handleNextHand} className="text-sm text-gold font-semibold">New Hand →</button>
      </div>

      <CaribbeanSessionBar session={session} />

      <div className="mb-2 py-2 px-3 rounded-xl bg-gold/20 border border-gold/50 text-center">
        <p className="text-gold font-bold text-sm">{STEP_LABELS[step]}</p>
        <p className="text-white/60 text-xs mt-0.5">
          {step === 'dealer-up' && 'Tap dealer up-card or use photo read'}
          {step === 'player' && `${playerCards.length}/5 cards · snap table photo or tap cards`}
          {step === 'bet' && 'Snap table photo to fill cards, then fold or raise'}
          {step === 'showdown' && (
            betAction === 'fold'
              ? `Folded — log dealer cards 2–5 (${dealerRest.length}/4) for tracking`
              : `Log dealer cards 2–5 (${dealerRest.length}/4)`
          )}
          {step === 'done' && (resultText ?? 'Hand complete')}
        </p>
      </div>

      {(step === 'dealer-up' || step === 'player' || step === 'bet' || step === 'showdown') && (
        <div className="mb-2">
          <PhotoCapture
            compact
            expectedCount={
              step === 'dealer-up' ? 1
                : step === 'showdown' ? 4
                  : step === 'bet' || step === 'player' ? 6
                    : 5
            }
            slotIds={
              step === 'dealer-up' ? ['d1']
                : step === 'showdown' ? dealerRestIds
                  : step === 'bet' || step === 'player' ? tableSlotIds
                    : playerIds
            }
            context={
              step === 'dealer-up' ? 'dealer-up'
                : step === 'showdown' ? 'dealer-rest'
                  : step === 'bet' || step === 'player' ? 'table'
                    : 'player-hand'
            }
            onCardsDetected={handlePhotoCards}
            label={
              step === 'dealer-up'
                ? 'Photo: dealer up-card'
                : step === 'showdown'
                  ? 'Photo: dealer cards 2–5'
                  : step === 'bet' || step === 'player'
                    ? 'Photo: snap table (dealer + your 5)'
                    : 'Photo: your 5 cards'
            }
          />
        </div>
      )}

      <div className="rounded-3xl bg-gradient-to-b from-felt to-felt-dark border-4 border-amber-900/40 shadow-2xl p-4 mb-2">
        <div className="mb-5">
          <p className="text-xs text-center text-white/50 uppercase mb-2">
            Dealer {dealerUp && <span className="text-gold normal-case">· up: {formatRankDisplay(dealerUp.rank)}{dealerUp.suit[0]}</span>}
          </p>
          {dealerEval && (
            <p className="text-center text-sm text-white/70 mb-2">
              {dealerEval.label}
              <span className={`ml-2 text-xs ${dealerQualifiesHand ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                {dealerQualifiesHand ? '· Qualifies ✓' : '· No qualify (needs A-K)'}
              </span>
            </p>
          )}
          {!dealerEval && step === 'showdown' && dealerRest.length > 0 && (
            <p className="text-center text-xs text-white/40 mb-2">
              {dealerRest.length}/4 hole cards · hand rank appears at 5
            </p>
          )}
          <div className="flex justify-center gap-2">
            <PlayingCard
              card={dealerUp}
              label="Up"
              onClick={canPick('d1') ? () => setPickerSlot({ id: 'd1', label: 'Dealer up-card' }) : undefined}
              selected={step === 'dealer-up' && !dealerUp}
              size="sm"
            />
            {dealerRestIds.map((id, i) =>
              step === 'showdown' || step === 'done' || state.cards[id] ? (
                <PlayingCard
                  key={id}
                  card={state.cards[id] ?? null}
                  label={`D${i + 2}`}
                  onClick={canPick(id) ? () => setPickerSlot({ id, label: `Dealer card ${i + 2}` }) : undefined}
                  selected={step === 'showdown' && !state.cards[id]}
                  size="sm"
                />
              ) : (
                <CardBack key={id} size="sm" />
              )
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-center text-gold uppercase font-semibold mb-2">
            Your Hand {playerCards.length === 5 && '✓'}
          </p>
          {playerEval && <p className="text-center text-sm text-white/70 mb-2">{playerEval.label}</p>}
          <div className="flex justify-center gap-2 flex-wrap">
            {game.playerSlots.map((slot, i) => (
              <PlayingCard
                key={slot.id}
                card={state.cards[slot.id] ?? null}
                label={slot.label}
                onClick={canPick(slot.id) ? () => setPickerSlot({ id: slot.id, label: slot.label }) : undefined}
                selected={step === 'player' && !state.cards[slot.id]}
                delay={i * 60}
                size="md"
              />
            ))}
          </div>
        </div>
      </div>

      <InlineBetStrip game={game} rules={rules} onChange={onUpdateRules} />

      {step === 'player' && (
        <div className="mt-2">
          <CaribbeanAnalysisBar
            analysis={betAnalysis}
            aiAdvice={lastAiAdvice}
            loading={aiLoading}
            ante={ante}
            raiseAmt={raiseAmt}
            cardsReady={cardsReady}
            onOpenSettings={onOpenSettings}
          />
        </div>
      )}

      {step === 'bet' && betAnalysis && (
        <div className="mt-1 px-2 text-center text-[10px] text-white/40">
          {shouldRaise
            ? raiseReason || 'Strategy says raise for max value'
            : `Fold saves ${formatMoneyWithSymbol(raiseAmt)} raise exposure`}
        </div>
      )}

      {step === 'done' && resultText && (
        <div className="mt-3 p-4 rounded-xl bg-black/40 border border-emerald-500/30">
          <p className="font-bold text-sm">{resultText}</p>
          {playerEval && (
            <p className="text-xs text-white/60 mt-1">Your hand: {playerEval.label}</p>
          )}
          {dealerEval && (
            <p className="text-xs text-white/60 mt-0.5">
              Dealer: {dealerEval.label}
              {dealerQualifiesHand ? ' · qualifies' : ' · no qualify'}
            </p>
          )}
          {betAction && (
            <p className="text-xs text-white/50 mt-1">
              You {betAction === 'raise' ? `raised ${formatMoneyWithSymbol(raiseAmt)}` : 'folded'}
              {lastAiAdvice && (
                <span className={didFollowAi(lastAiAdvice, betAction) ? ' text-emerald-400' : ' text-amber-400'}>
                  {' · '}{didFollowAi(lastAiAdvice, betAction) ? 'Followed AI ✓' : 'Deviated from AI'}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      <HandTrendsPanel
        hands={loggedHands}
        trends={trends}
        cloudSync={isSupabaseConfigured()}
        defaultCollapsed
        onDeleteHand={handleDeleteHand}
        onClearAll={handleClearAllHands}
      />

      <div className="fixed bottom-0 inset-x-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
        <div className="max-w-lg mx-auto space-y-2">
          {showAnalysis && cardsReady && step === 'bet' && (
            <CaribbeanAnalysisBar
              analysis={betAnalysis}
              aiAdvice={lastAiAdvice}
              loading={aiLoading}
              ante={ante}
              raiseAmt={raiseAmt}
              cardsReady
              onOpenSettings={onOpenSettings}
            />
          )}
          {step === 'dealer-up' && !dealerUp && (
            <p className="text-center text-sm text-gold py-3">👆 Tap the dealer up-card above</p>
          )}
          {step === 'bet' && (
            <div className="flex gap-2">
              <button type="button" onClick={() => handleBet('fold')} className="flex-1 py-4 rounded-xl bg-red-600 font-bold text-lg">Fold</button>
              <button type="button" onClick={() => handleBet('raise')} className="flex-[1.4] py-4 rounded-xl bg-gold text-slate-900 font-bold text-lg">Raise {formatMoneyWithSymbol(raiseAmt)}</button>
            </div>
          )}
          {step === 'showdown' && (
            <div className="text-center py-1">
              <p className="text-sm text-white/70">
                {betAction === 'fold' ? 'Folded — ' : 'Raised — '}
                tap dealer cards D2–D5 ({dealerRest.length}/4)
              </p>
              {dealerRest.length < 4 && (
                <button
                  type="button"
                  onClick={() => dealerUp && finalizeHand(betAction!, [dealerUp, ...dealerRest])}
                  className="mt-1 text-[10px] text-white/40 underline hover:text-white/60"
                >
                  Skip dealer cards &amp; finish
                </button>
              )}
            </div>
          )}
          {step === 'done' && (
            <button type="button" onClick={handleNextHand} className="w-full py-4 rounded-xl bg-gold text-slate-900 font-bold text-lg">Next Hand →</button>
          )}
          <p className="text-center text-[10px] text-white/30 mt-2">ante {formatMoneyWithSymbol(ante)} · raise {formatMoneyWithSymbol(raiseAmt)}</p>
        </div>
      </div>

      {pickerSlot && (
        <CardPicker
          slotLabel={pickerSlot.label}
          current={state.cards[pickerSlot.id] ?? null}
          usedCards={pickerUsedCards}
          onSelect={card => onUpdateCards({ ...state.cards, [pickerSlot.id]: card })}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  )
}
