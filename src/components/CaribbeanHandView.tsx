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
import {
  findDuplicateCards,
  validateTableForBet,
  validateTableForScore,
} from '../lib/handValidation'
import { sanitizePhotoMapping } from '../lib/photoCardMapping'
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
  const [validationError, setValidationError] = useState<string | null>(null)
  const scoredRef = useRef(false)
  const aiFetchedForHand = useRef(false)

  const dealerUp = state.cards['d1'] ?? null
  const playerIds = game.playerSlots.map(s => s.id)
  const playerCards = playerIds.map(id => state.cards[id]).filter((c): c is Card => !!c)
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
  const tableDup = findDuplicateCards(
    playerCards,
    dealerUp ? [dealerUp] : [],
    dealerRest
  )
  const betReady = validateTableForBet(playerCards, dealerUp).ok && !tableDup
  const showdownPreview = betAction && allDealerCards.length === 5
    ? calculateOutcome(playerCards, allDealerCards, ante, raiseAmt, betAction, progressive)
    : null

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

    const validation = validateTableForScore(
      playerCards,
      dealerUp,
      allDealer.slice(1),
      action
    )
    if (!validation.ok) {
      setValidationError(validation.message ?? 'Invalid hand')
      return
    }

    const outcome = calculateOutcome(playerCards, allDealer, ante, raiseAmt, action, progressive)
    if (!outcome.valid) {
      setValidationError(outcome.summary)
      return
    }

    scoredRef.current = true
    setValidationError(null)
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
      wins: outcome.outcomeType === 'win' || outcome.outcomeType === 'dealer_no_qualify'
        ? prev.wins + 1
        : prev.wins,
      losses: outcome.outcomeType === 'loss' ? prev.losses + 1 : prev.losses,
      netPnL: prev.netPnL + outcome.netResult,
      bankroll: prev.bankroll + outcome.netResult,
    }))
  }

  const handleBet = (action: 'raise' | 'fold') => {
    const check = validateTableForBet(playerCards, dealerUp)
    if (!check.ok) {
      setValidationError(check.message ?? 'Complete your hand first')
      return
    }
    if (tableDup) {
      setValidationError(tableDup)
      return
    }
    setValidationError(null)
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
    setValidationError(null)
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

  const handlePhotoCards = (mapping: Record<string, Card>) => {
    const { mapping: clean, warnings } = sanitizePhotoMapping(mapping, state.cards)
    if (Object.keys(clean).length === 0) {
      setValidationError(warnings[0] ?? 'No new cards applied from photo')
      return
    }
    setValidationError(null)
    onUpdateCards({ ...state.cards, ...clean })
    aiFetchedForHand.current = false
    setLastAiAdvice(null)
    setPhotoRefresh(n => n + 1)
  }

  const tableSlotIds = ['d1', ...playerIds]

  const pickerUsedCards = pickerSlot
    ? Object.entries(state.cards)
        .filter(([id, c]) => id !== pickerSlot.id && c)
        .map(([, c]) => c as Card)
    : []

  const stepHint =
    step === 'dealer-up' ? 'Snap all 6 cards (dealer + yours) or tap'
      : step === 'player' ? `${playerCards.length}/5 · snap all 6 or tap cards`
        : step === 'bet' ? (shouldRaise ? (raiseReason || 'Strategy says raise') : `Fold saves ${formatMoneyWithSymbol(raiseAmt)}`)
          : step === 'showdown'
            ? (betAction === 'fold'
              ? `Snap dealer hand (${dealerRest.length}/4 hole) or tap`
              : `Snap dealer hand (${dealerRest.length}/4 hole) · ${showdownPreview?.valid ? 'scoring…' : 'tap or photo'}`)
            : (resultText ?? 'Hand complete')

  const bannerText = validationError ?? tableDup ?? stepHint
  const bannerAlert = !!(validationError || tableDup)
  const showPhoto = step === 'dealer-up' || step === 'player' || step === 'bet' || step === 'showdown'

  const dealerSlotIds = ['d1', ...dealerRestIds]
  const photoConfig =
    step === 'showdown'
      ? { context: 'dealer-rest' as const, expected: 5, slots: dealerSlotIds, label: 'Photo: dealer 5 cards' }
      : { context: 'table' as const, expected: 6, slots: tableSlotIds, label: 'Photo: snap all 6 cards' }

  return (
    <>
      <div className="caribbean-shell fixed inset-0 z-30 flex justify-center overflow-hidden">
        <div className="w-full max-w-lg h-full flex flex-col overflow-hidden px-3 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
          {/* Header */}
          <header className="shrink-0 pt-1 pb-0.5">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white shrink-0">← Exit</button>
              <span className="text-sm font-bold truncate">🏝️ Caribbean Stud</span>
              <div className="flex items-center gap-1 shrink-0">
                {onOpenSettings && (
                  <button type="button" onClick={onOpenSettings} className="w-8 h-8 rounded-full bg-white/10 text-sm" aria-label="Settings">⚙️</button>
                )}
                <button type="button" onClick={handleNextHand} className="text-sm text-gold font-semibold">New →</button>
              </div>
            </div>
            <CaribbeanSessionBar session={session} compact />
            <div className={`py-1.5 px-2.5 rounded-lg text-center border ${bannerAlert ? 'bg-red-950/70 border-red-500/40' : 'bg-gold/15 border-gold/40'}`}>
              <p className="text-gold font-bold text-sm leading-tight">{STEP_LABELS[step]}</p>
              <p className={`text-xs leading-tight truncate mt-0.5 ${bannerAlert ? 'text-red-300' : 'text-white/60'}`}>{bannerText}</p>
            </div>
            {showPhoto && (
              <PhotoCapture
                prominent
                expectedCount={photoConfig.expected}
                slotIds={photoConfig.slots}
                context={photoConfig.context}
                existingCards={state.cards}
                onCardsDetected={handlePhotoCards}
                label={photoConfig.label}
              />
            )}
          </header>

          {/* Table — fills remaining space, no scroll */}
          <main className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden py-1">
            <div className="rounded-2xl bg-gradient-to-b from-felt to-felt-dark border-2 border-amber-900/40 shadow-xl p-2 shrink min-h-0">
              <div className="mb-2">
                <p className="text-[9px] text-center text-white/50 uppercase mb-1">
                  Dealer {dealerUp && <span className="text-gold normal-case">· {formatRankDisplay(dealerUp.rank)}{dealerUp.suit[0]}</span>}
                </p>
                {dealerEval && (
                  <p className="text-center text-[10px] text-white/70 mb-1 truncate">
                    {dealerEval.label}
                    <span className={`ml-1 ${dealerQualifiesHand ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                      {dealerQualifiesHand ? '· Q ✓' : '· no Q'}
                    </span>
                  </p>
                )}
                <div className="flex justify-center gap-0.5 flex-nowrap">
                  <PlayingCard
                    card={dealerUp}
                    label="Up"
                    onClick={canPick('d1') ? () => setPickerSlot({ id: 'd1', label: 'Dealer up-card' }) : undefined}
                    selected={step === 'dealer-up' && !dealerUp}
                    size="xs"
                  />
                  {dealerRestIds.map((id, i) =>
                    step === 'showdown' || step === 'done' || state.cards[id] ? (
                      <PlayingCard
                        key={id}
                        card={state.cards[id] ?? null}
                        label={`D${i + 2}`}
                        onClick={canPick(id) ? () => setPickerSlot({ id, label: `Dealer card ${i + 2}` }) : undefined}
                        selected={step === 'showdown' && !state.cards[id]}
                        size="xs"
                      />
                    ) : (
                      <CardBack key={id} size="xs" />
                    )
                  )}
                </div>
              </div>

              <div>
                <p className="text-[9px] text-center text-gold uppercase font-semibold mb-1">
                  Your Hand {playerCards.length === 5 && '✓'}
                </p>
                {playerEval && <p className="text-center text-[10px] text-white/70 mb-1 truncate">{playerEval.label}</p>}
                <div className="flex justify-center gap-1 flex-nowrap">
                  {game.playerSlots.map((slot, i) => (
                    <PlayingCard
                      key={slot.id}
                      card={state.cards[slot.id] ?? null}
                      label={slot.label}
                      onClick={canPick(slot.id) ? () => setPickerSlot({ id: slot.id, label: slot.label }) : undefined}
                      selected={step === 'player' && !state.cards[slot.id]}
                      delay={i * 60}
                      size="sm"
                    />
                  ))}
                </div>
              </div>
            </div>
          </main>

          {/* Bottom dock — actions, analysis, photo; no page scroll */}
          <footer className="shrink-0 space-y-1.5 pt-1 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
            <InlineBetStrip game={game} rules={rules} onChange={onUpdateRules} compact />

            {showAnalysis && (
              <CaribbeanAnalysisBar
                analysis={betAnalysis}
                aiAdvice={lastAiAdvice}
                loading={aiLoading}
                ante={ante}
                raiseAmt={raiseAmt}
                cardsReady={cardsReady}
                onOpenSettings={onOpenSettings}
                dense
              />
            )}

            {step === 'bet' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleBet('fold')}
                  disabled={!betReady}
                  className="flex-1 py-3 rounded-xl bg-red-600 font-bold text-base disabled:opacity-40"
                >
                  Fold
                </button>
                <button
                  type="button"
                  onClick={() => handleBet('raise')}
                  disabled={!betReady}
                  className="flex-[1.4] py-3 rounded-xl bg-gold text-slate-900 font-bold text-base disabled:opacity-40"
                >
                  Raise {formatMoneyWithSymbol(raiseAmt)}
                </button>
              </div>
            )}

            {step === 'showdown' && (
              <div className="text-center py-0.5">
                {betAction === 'fold' && dealerRest.length < 4 && (
                  <button
                    type="button"
                    onClick={() => dealerUp && finalizeHand('fold', [dealerUp, ...dealerRest])}
                    className="text-[10px] text-white/40 underline hover:text-white/60"
                  >
                    Finish without full dealer hand
                  </button>
                )}
              </div>
            )}

            {step === 'done' && (
              <>
                {resultText && playerEval && (
                  <p className="text-[10px] text-center text-white/50 truncate px-1">
                    {playerEval.label}
                    {dealerEval && ` · Dlr: ${dealerEval.label}`}
                    {betAction && ` · ${betAction === 'raise' ? 'raised' : 'folded'}`}
                  </p>
                )}
                <button type="button" onClick={handleNextHand} className="w-full py-3 rounded-xl bg-gold text-slate-900 font-bold text-base">
                  Next Hand →
                </button>
                <HandTrendsPanel
                  hands={loggedHands}
                  trends={trends}
                  cloudSync={isSupabaseConfigured()}
                  defaultCollapsed
                  onDeleteHand={handleDeleteHand}
                  onClearAll={handleClearAllHands}
                />
              </>
            )}
          </footer>
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
    </>
  )
}
