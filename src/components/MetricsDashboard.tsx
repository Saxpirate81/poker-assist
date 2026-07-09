import { useCallback, useEffect, useState } from 'react'
import type { LoggedCaribbeanHand } from '../types/handLog'
import type { ExtendedHandTrends, GameMetricsBundle, MetricRecommendation } from '../types/metrics'
import type { GameMetricsAdjustments } from '../types/metrics'
import {
  generateRecommendations,
  loadAdjustments,
  loadAllGameMetrics,
  saveAdjustments,
  visibleRecommendations,
} from '../lib/metricsService'
import { formatHandLine, formatHandTimestamp, formatShowdownStreak } from '../lib/handLogService'
import { formatMoneyWithSymbol } from '../lib/money'
import { POKER_GAMES } from '../data/games'
import { LineChart, BarChart, RateBar, MetricInfoTip, ToggleBreakdownChart, OutcomeTimeline } from './MetricCharts'
import { computeBetOutcomeBreakdown, buildOutcomeTimeline } from '../lib/handLogService'
import {
  getActualBankroll,
  getStartingBankroll,
  getDisplayBankroll,
  setActualBankroll,
  setStartingBankroll,
  syncCaribbeanSessionBankroll,
  impliedStartingBankroll,
} from '../lib/bankrollConfig'

interface MetricsDashboardProps {
  onClose: () => void
  initialGameId?: string
}

const METRIC_HELP: Record<string, { title: string; body: string }> = {
  bankroll: {
    title: 'Your bankroll',
    body: 'Your real table stack. Tap Edit to enter what you actually have (e.g. $70.51). We save it separately from the old $500 default. If unset, we use Starting stack + logged P&L.',
  },
  pnl: {
    title: 'All-time P&L',
    body: 'Total profit or loss from every logged hand — antes, raises, and outcomes combined. This is from hand history only, not your casino account balance.',
  },
  winRate: {
    title: 'Win rate (showdowns)',
    body: 'Among raised hands with a full dealer hand logged: how often you won (dealer no-qualify ante wins + qualified showdown wins). Folds and incomplete raises are excluded.',
  },
  roi: {
    title: 'ROI',
    body: 'Return on investment: P&L divided by total amount wagered (antes + raises + side bets). Positive ROI means you are beating the house long-term.',
  },
  followAi: {
    title: 'Follow AI',
    body: 'When your raise/fold matched the on-screen coach (green raise / red fold bar). Recalculated from your cards + dealer up-card, so it reflects what you actually saw — not whether async Gemini had finished loading.',
  },
  runningPnl: {
    title: 'Running P&L',
    body: 'Cumulative profit/loss after each hand, oldest to newest. Upward slope = winning streak; flat or down = adjust strategy or bet size.',
  },
  dealerQual: {
    title: 'Dealer qualify rate',
    body: 'How often the dealer has Ace-King or better at showdown when you raised. Typical tables ~65–70%. More no-qualify hands = more ante wins for you.',
  },
  dealerWin: {
    title: 'Showdown split (when dealer qualified)',
    body: 'When the dealer qualifies, you and the dealer split every non-push showdown — your win % + dealer win % = 100%. Pushes are shown separately and do not count in that pair.',
  },
  playerWinQual: {
    title: 'You win (when dealer qualified)',
    body: 'When the dealer has Ace-King or better, how often your hand wins at showdown (excludes pushes). This plus dealer win % equals 100% of decided qual showdowns.',
  },
  dealerStreak: {
    title: 'Dealer streaks',
    body: 'Q = dealer qualified · N = no qualify · W = you won qual showdown · L = dealer won qual showdown · T = push. Counts consecutive showdowns from your most recent hand.',
  },
  betOutcome: {
    title: 'When you raise — outcomes',
    body: 'Breakdown of every raise: dealer no-qualify (free ante win), you winning/losing at showdown, pushes, and raises where the full dealer hand was not logged. Tap any key item to hide or show it on the chart.',
  },
  outcomeTimeline: {
    title: 'Outcome timeline',
    body: 'Every hand in order — color-coded by outcome. Strip view scrolls left (oldest) to right (newest). Timeline list groups by date. Tap legend pills to filter (synced with the donut chart above).',
  },
}

function MetricRow({
  label,
  value,
  sub,
  highlight,
  infoKey,
}: {
  label: string
  value: string
  sub?: string
  highlight?: 'good' | 'bad' | 'neutral'
  infoKey?: keyof typeof METRIC_HELP
}) {
  const color = highlight === 'good' ? 'text-emerald-400' : highlight === 'bad' ? 'text-red-400' : ''
  const help = infoKey ? METRIC_HELP[infoKey] : null
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 gap-2">
      <span className="text-xs text-white/50 flex items-center">
        {label}
        {help && <MetricInfoTip title={help.title} body={help.body} />}
      </span>
      <div className="text-right shrink-0">
        <span className={`text-sm font-bold ${color}`}>{value}</span>
        {sub && <p className="text-[10px] text-white/35">{sub}</p>}
      </div>
    </div>
  )
}

function BankrollPanel({
  totalPnL,
  displayBankroll,
  onUpdate,
}: {
  totalPnL: number
  displayBankroll: number
  onUpdate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(displayBankroll))
  const starting = getStartingBankroll()
  const actual = getActualBankroll()
  const computed = starting + totalPnL

  const save = () => {
    const n = Number(draft)
    if (!Number.isFinite(n) || n < 0) return
    setActualBankroll(n)
    syncCaribbeanSessionBankroll(totalPnL)
    setEditing(false)
    onUpdate()
  }

  const useComputed = () => {
    setActualBankroll(null)
    syncCaribbeanSessionBankroll(totalPnL)
    setEditing(false)
    onUpdate()
  }

  return (
    <div className="rounded-xl bg-black/30 border border-gold/30 p-3 mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/50 flex items-center">
          Your bankroll
          <MetricInfoTip {...METRIC_HELP.bankroll!} />
        </span>
        {!editing && (
          <button type="button" onClick={() => { setDraft(String(displayBankroll)); setEditing(true) }} className="text-[10px] text-gold font-semibold">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex gap-2 items-center mt-2">
          <span className="text-gold">$</span>
          <input
            type="number"
            step="0.01"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-lg bg-black/40 border border-gold/40 text-gold font-bold"
          />
          <button type="button" onClick={save} className="px-3 py-1.5 rounded-lg bg-gold text-slate-900 text-xs font-bold">Save</button>
        </div>
      ) : (
        <p className="text-2xl font-bold text-gold">{formatMoneyWithSymbol(displayBankroll)}</p>
      )}
      <div className="mt-2 space-y-1 text-[10px] text-white/45">
        <p>Logged P&amp;L: {totalPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(totalPnL)}</p>
        <p>Starting stack: {formatMoneyWithSymbol(starting)} · Computed: {formatMoneyWithSymbol(computed)}</p>
        {actual !== null && (
          <button type="button" onClick={useComputed} className="text-gold/80 underline">
            Use computed ({formatMoneyWithSymbol(computed)}) instead
          </button>
        )}
        {editing && (
          <p className="text-white/35">Tip: enter your real balance (e.g. 70.51) — starting stack implied: {formatMoneyWithSymbol(impliedStartingBankroll(Number(draft) || 0, totalPnL))}</p>
        )}
      </div>
      <div className="mt-2 flex gap-2 items-center">
        <label className="text-[10px] text-white/40">Starting stack $</label>
        <input
          type="number"
          step="0.01"
          defaultValue={starting}
          onBlur={e => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) {
              setStartingBankroll(v)
              syncCaribbeanSessionBankroll(totalPnL)
              onUpdate()
            }
          }}
          className="w-20 px-2 py-1 rounded bg-black/40 border border-white/10 text-xs text-white"
        />
      </div>
    </div>
  )
}

function RecommendationsSection({
  gameId,
  recs,
  adj,
  onAdjChange,
}: {
  gameId: string
  recs: MetricRecommendation[]
  adj: GameMetricsAdjustments
  onAdjChange: (a: GameMetricsAdjustments) => void
}) {
  const visible = visibleRecommendations(recs, adj)

  const accept = (r: MetricRecommendation) => {
    const next: GameMetricsAdjustments = {
      ...adj,
      acceptedIds: [...new Set([...adj.acceptedIds, r.id])],
      dismissedIds: adj.dismissedIds.filter(id => id !== r.id),
    }
    if (r.settingId && r.suggestedValue !== undefined) {
      next.userOverrides = { ...next.userOverrides, [r.settingId]: r.suggestedValue }
    }
    saveAdjustments(next)
    onAdjChange(next)
  }

  const dismiss = (id: string) => {
    const next: GameMetricsAdjustments = {
      ...adj,
      dismissedIds: [...adj.dismissedIds, id],
      acceptedIds: adj.acceptedIds.filter(x => x !== id),
    }
    saveAdjustments(next)
    onAdjChange(next)
  }

  const updateOverride = (settingId: string, value: string) => {
    const num = Number(value)
    const next: GameMetricsAdjustments = {
      ...adj,
      userOverrides: {
        ...adj.userOverrides,
        [settingId]: Number.isNaN(num) ? value : num,
      },
    }
    saveAdjustments(next)
    onAdjChange(next)
  }

  const updateNotes = (notes: string) => {
    const next = { ...adj, notes }
    saveAdjustments(next)
    onAdjChange(next)
  }

  const priorityColor = { high: 'border-red-500/40 bg-red-950/30', medium: 'border-amber-500/30 bg-amber-950/20', low: 'border-white/10 bg-white/5' }

  const categoryHelp: Record<string, { title: string; body: string }> = {
    betting: { title: 'Betting tweak', body: 'Suggested ante or bet size based on your win rate, ROI, and bankroll. Accept to save the value — you can still edit it before your next session.' },
    strategy: { title: 'Strategy tweak', body: 'Raise/fold pattern vs optimal Caribbean Stud basics. Based on how often you raise weak hands or fold strong ones.' },
    discipline: { title: 'Discipline', body: 'How well you follow the AI coach vs going on tilt. Compare follow vs ignore P&L in the charts above.' },
    bankroll: { title: 'Bankroll management', body: 'Keeps your stack healthy relative to bet size. Rule of thumb: 20–40× your ante in stack for variance.' },
  }

  return (
    <section className="mt-4">
      <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2 flex items-center">
        AI recommendations
        <MetricInfoTip
          title="AI recommendations"
          body="Personalized tips from your logged hands — win rate, fold rate, AI follow rate, and P&L trends. Tap (i) on each card for why it was suggested. Accept to save tweaks to your strategy notes."
        />
      </h3>
      <p className="text-[10px] text-white/40 mb-3">Based on your stats — accept to save tweaks, or adjust values yourself.</p>

      {visible.length === 0 ? (
        <p className="text-xs text-white/40 py-3 text-center rounded-lg bg-white/5">
          {recs.length === 0 ? 'Need more hands for personalized recommendations.' : 'All recommendations dismissed.'}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(r => {
            const accepted = adj.acceptedIds.includes(r.id)
            return (
              <div key={r.id} className={`rounded-xl border p-3 ${priorityColor[r.priority]}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold flex items-center">
                      {r.title}
                      <MetricInfoTip {...categoryHelp[r.category]} />
                    </p>
                    <p className="text-xs text-white/70 mt-1">{r.detail}</p>
                    {r.metricBasis && <p className="text-[10px] text-white/35 mt-1">{r.metricBasis}</p>}
                  </div>
                  <span className="text-[9px] uppercase text-white/30 shrink-0">{r.priority}</span>
                </div>

                {r.settingId && r.suggestedValue !== undefined && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[10px] text-white/50">{r.settingId}</label>
                    <input
                      type="number"
                      step={0.25}
                      value={String(adj.userOverrides[r.settingId] ?? r.suggestedValue)}
                      onChange={e => updateOverride(r.settingId!, e.target.value)}
                      className="w-20 px-2 py-1 rounded bg-black/40 border border-white/10 text-sm text-gold"
                    />
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => accept(r)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${accepted ? 'bg-emerald-700/50 text-emerald-200' : 'bg-gold/20 text-gold hover:bg-gold/30'}`}
                  >
                    {accepted ? '✓ Applied' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(r.id)}
                    className="px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 bg-white/5"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-3">
        <label className="text-[10px] text-white/40 block mb-1">Your notes (strategy tweaks over time)</label>
        <textarea
          value={adj.notes}
          onChange={e => updateNotes(e.target.value)}
          placeholder="e.g. Lower ante on Tuesdays, always max raise with pairs..."
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white/80 resize-none"
        />
      </div>

      {Object.keys(adj.userOverrides).length > 0 && (
        <div className="mt-2 p-2 rounded-lg bg-gold/10 border border-gold/20">
          <p className="text-[10px] text-gold uppercase mb-1">Active tweaks for {gameId}</p>
          {Object.entries(adj.userOverrides).map(([k, v]) => (
            <p key={k} className="text-xs text-white/70">{k}: {String(v)}</p>
          ))}
        </div>
      )}
    </section>
  )
}

function CaribbeanDetail({
  ext,
  hands,
  onRefresh,
}: {
  ext: ExtendedHandTrends
  hands: LoggedCaribbeanHand[]
  onRefresh: () => void
}) {
  const pnlGood = ext.totalPnL >= 0
  const chronoHands = [...hands].reverse()
  const handDates = chronoHands.map(h => h.createdAt)
  const allPerHand = ext.allPnL
  const perHandMeta = allPerHand.map((_, i) => ({ label: `Hand ${i + 1} of ${ext.totalHands}` }))
  const dailyPnl = ext.byDay.map(d => d.pnl)
  const dailyLabels = ext.byDay.map(d => d.date)

  const runningMeta = ext.cumulativePnL.map((_, i) => ({ label: `Hand ${i + 1} of ${ext.totalHands}` }))
  const dailyMeta = ext.byDay.map(d => ({ label: d.date, sublabel: `${d.hands} hand${d.hands === 1 ? '' : 's'}` }))
  const aiMeta = [
    { label: 'Follow AI', sublabel: `${ext.aiFollowRate.toFixed(0)}% follow rate` },
    { label: 'Ignore AI', sublabel: `${(100 - ext.aiFollowRate).toFixed(0)}% ignore rate` },
  ]
  const betOutcome = computeBetOutcomeBreakdown(hands)
  const outcomeTimeline = buildOutcomeTimeline(hands)

  return (
    <>
      <BankrollPanel
        totalPnL={ext.totalPnL}
        displayBankroll={ext.sessionBankroll}
        onUpdate={onRefresh}
      />

      <div className="flex items-baseline justify-between mb-3 px-1">
        <span className="text-xs text-white/50 flex items-center">
          All-time P&amp;L ({ext.totalHands} hands)
          <MetricInfoTip {...METRIC_HELP.pnl!} />
        </span>
        <span className={`text-lg font-bold ${pnlGood ? 'text-emerald-400' : 'text-red-400'}`}>
          {ext.totalPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(ext.totalPnL)}
        </span>
      </div>

      <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-3 overflow-hidden">
        <p className="text-[10px] uppercase text-white/40 mb-2 flex items-center">
          Running P&amp;L
          <MetricInfoTip {...METRIC_HELP.runningPnl!} />
        </p>
        <LineChart
          values={ext.cumulativePnL}
          meta={runningMeta}
          secondaryValues={ext.allPnL}
          axisDates={handDates}
          axisStep={10}
          title={`${ext.totalHands} hands — scroll for older`}
          scrollable
          height={128}
        />
      </div>

      <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-3 overflow-hidden">
        <BarChart
          values={allPerHand}
          meta={perHandMeta}
          axisDates={handDates}
          axisStep={10}
          title={`Each hand P&L · ${ext.totalHands} hands`}
          scrollable
          height={80}
        />
      </div>

      {dailyPnl.length > 0 && (
        <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-3 overflow-hidden">
          <BarChart
            values={dailyPnl}
            labels={dailyLabels}
            meta={dailyMeta}
            axisMode="label"
            title={`Daily P&L · ${dailyPnl.length} days`}
            scrollable={dailyPnl.length > 7}
            height={80}
          />
        </div>
      )}

      <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-3">
        <p className="text-[10px] uppercase text-white/40 mb-2">Action mix</p>
        <RateBar segments={[
          { label: 'Raises', pct: ext.raiseRate, color: 'bg-emerald-600', count: ext.raises },
          { label: 'Folds', pct: ext.foldRate, color: 'bg-amber-600', count: ext.folds },
        ]} />
      </div>

      <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-3 overflow-hidden">
        <BarChart
          values={[ext.followAiPnL, ext.ignoreAiPnL]}
          meta={aiMeta}
          title="AI coach: P&L when follow vs ignore"
          height={64}
        />
        <div className="flex justify-between text-[9px] text-white/40 mt-1">
          <span>Follow AI {formatMoneyWithSymbol(ext.followAiPnL)}</span>
          <span>Ignore AI {formatMoneyWithSymbol(ext.ignoreAiPnL)}</span>
        </div>
      </div>

      <div className="rounded-xl bg-black/30 border border-white/10 px-3 mb-3">
        <p className="text-[10px] uppercase text-gold pt-2 pb-1 flex items-center">
          Dealer
          <MetricInfoTip {...METRIC_HELP.dealerStreak!} />
        </p>
        <MetricRow
          infoKey="dealerQual"
          label="Qualify rate"
          value={`${ext.dealer.qualifyRate.toFixed(1)}%`}
          sub={`${ext.dealer.qualifyCount}Q · ${ext.dealer.noQualifyCount}NQ (${ext.dealer.showdownHands} showdowns)`}
        />
        <MetricRow
          label="No-qualify rate"
          value={`${ext.dealer.noQualifyRate.toFixed(1)}%`}
          sub={`${ext.dealer.winsFromNoQual} ante wins from NQ`}
          highlight={ext.dealer.noQualifyRate >= 30 ? 'good' : 'neutral'}
        />
        <MetricRow
          infoKey="playerWinQual"
          label="You win (when qualified)"
          value={`${ext.dealer.playerWinRateWhenQual.toFixed(1)}%`}
          sub={`${ext.dealer.playerWinsWhenQual}W · pairs with dealer ${ext.dealer.dealerWinRateWhenQual.toFixed(1)}%`}
          highlight={ext.dealer.playerWinRateWhenQual >= 55 ? 'good' : ext.dealer.playerWinRateWhenQual <= 45 ? 'bad' : 'neutral'}
        />
        <MetricRow
          infoKey="dealerWin"
          label="Dealer wins (when qualified)"
          value={`${ext.dealer.dealerWinRateWhenQual.toFixed(1)}%`}
          sub={`${ext.dealer.playerLossesWhenQual}L · you + dealer = 100% (excl. ${ext.dealer.pushesWhenQual} push${ext.dealer.pushesWhenQual === 1 ? '' : 'es'})`}
          highlight={ext.dealer.dealerWinRateWhenQual <= 45 ? 'good' : ext.dealer.dealerWinRateWhenQual >= 55 ? 'bad' : 'neutral'}
        />
        {ext.dealer.pushesWhenQual > 0 && (
          <MetricRow
            label="Push (when qualified)"
            value={`${ext.dealer.pushRateWhenQual.toFixed(1)}%`}
            sub={`${ext.dealer.pushesWhenQual}T · you + dealer + push = 100% of qual showdowns`}
          />
        )}
        <MetricRow
          label="Current dealer streaks"
          value={`${ext.dealer.currentQualifyStreak} · ${ext.dealer.currentNoQualStreak} · ${ext.dealer.currentDealerWinStreak}`}
          sub="Qualify · No-qual · Dealer wins"
        />
        <MetricRow
          label="Longest dealer streaks"
          value={`${ext.dealer.longestQualifyStreak}Q · ${ext.dealer.longestNoQualStreak}N · ${ext.dealer.longestDealerWinStreak}L`}
        />
        <MetricRow
          label="Recent showdowns"
          value={formatShowdownStreak(ext.dealer.recentShowdownStreak)}
          sub="Newest first: N · W · L · T"
        />
      </div>

      {betOutcome.slices.length > 0 && (
        <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-3">
          <p className="text-[10px] uppercase text-gold mb-2 flex items-center">
            When you raise — outcomes
            <MetricInfoTip {...METRIC_HELP.betOutcome!} />
          </p>
          <ToggleBreakdownChart
            slices={betOutcome.slices}
            totalRaises={betOutcome.totalRaises}
            showdownHands={betOutcome.showdownHands}
            title={`${betOutcome.totalRaises} raises · ${betOutcome.showdownHands} with full dealer hand`}
          />
          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-[10px] uppercase text-gold mb-2 flex items-center">
              Outcome timeline
              <MetricInfoTip {...METRIC_HELP.outcomeTimeline!} />
            </p>
            <OutcomeTimeline
              events={outcomeTimeline}
              title={`${outcomeTimeline.length} hands · oldest ← → newest`}
            />
          </div>
        </div>
      )}

      <div className="rounded-xl bg-black/30 border border-white/10 px-3 mb-3">
        <p className="text-[10px] uppercase text-gold pt-2 pb-1">Performance</p>
        <MetricRow
          infoKey="winRate"
          label="Win rate (showdowns)"
          value={`${ext.winRate.toFixed(1)}%`}
          sub={`${ext.dealer.playerWinsWhenQual + ext.dealer.winsFromNoQual}W · ${ext.dealer.playerLossesWhenQual}L · ${ext.dealer.pushesWhenQual}T · ${ext.dealer.showdownHands} showdowns`}
          highlight={ext.winRate >= 50 ? 'good' : ext.winRate < 40 ? 'bad' : 'neutral'}
        />
        <MetricRow label="Fold rate" value={`${ext.foldRate.toFixed(1)}%`} sub={`${ext.folds} folds`} />
        <MetricRow label="Raise rate" value={`${ext.raiseRate.toFixed(1)}%`} sub={`${ext.raises} raises`} />
        <MetricRow label="Raise win rate" value={`${ext.raiseWinRate.toFixed(1)}%`} highlight={ext.raiseWinRate >= 50 ? 'good' : 'bad'} />
        <MetricRow infoKey="roi" label="ROI" value={`${ext.roiPercent.toFixed(1)}%`} sub={`wagered ${formatMoneyWithSymbol(ext.totalWagered)}`} highlight={ext.roiPercent >= 0 ? 'good' : 'bad'} />
        <MetricRow label="Best hand / worst" value={`${formatMoneyWithSymbol(ext.bestWin)} / ${formatMoneyWithSymbol(ext.worstLoss)}`} />
        <MetricRow label="Longest W / L streak" value={`${ext.longestWinStreak} / ${ext.longestLossStreak}`} />
      </div>

      <div className="rounded-xl bg-black/30 border border-white/10 px-3 mb-3">
        <p className="text-[10px] uppercase text-gold pt-2 pb-1 flex items-center">
          AI coach
          <MetricInfoTip {...METRIC_HELP.followAi!} />
        </p>
        <MetricRow label="Follow AI rate" value={`${ext.aiFollowRate.toFixed(1)}%`} />
        <MetricRow label="Follow AI win rate" value={`${ext.aiFollowWinRate.toFixed(1)}%`} highlight={ext.aiFollowWinRate >= ext.aiIgnoreWinRate ? 'good' : 'neutral'} />
        <MetricRow label="Ignore AI win rate" value={`${ext.aiIgnoreWinRate.toFixed(1)}%`} />
        <MetricRow label="P&L when follow AI" value={`${ext.followAiPnL >= 0 ? '+' : ''}${formatMoneyWithSymbol(ext.followAiPnL)}`} highlight={ext.followAiPnL >= 0 ? 'good' : 'bad'} />
        <MetricRow label="P&L when ignore AI" value={`${ext.ignoreAiPnL >= 0 ? '+' : ''}${formatMoneyWithSymbol(ext.ignoreAiPnL)}`} highlight={ext.ignoreAiPnL >= 0 ? 'good' : 'bad'} />
      </div>

      <div className="rounded-xl bg-black/30 border border-white/10 px-3 mb-3">
        <p className="text-[10px] uppercase text-gold pt-2 pb-1">Today & averages</p>
        <MetricRow label="Today P&L" value={`${ext.todayPnL >= 0 ? '+' : ''}${formatMoneyWithSymbol(ext.todayPnL)}`} sub={`${ext.todayHands} hands`} highlight={ext.todayPnL >= 0 ? 'good' : 'bad'} />
        <MetricRow label="Avg ante" value={formatMoneyWithSymbol(ext.avgAnte)} />
        <MetricRow label="Avg raise" value={formatMoneyWithSymbol(ext.avgRaiseAmount)} />
        <MetricRow label="Current streak" value={ext.currentStreak} sub={`Recent: ${ext.recentStreak}`} />
      </div>

      {ext.byDay.length > 0 && (
        <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-3">
          <p className="text-[10px] uppercase text-white/40 mb-2">Daily breakdown ({ext.byDay.length} days)</p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {ext.byDay.map(d => (
              <div key={d.date} className="flex justify-between text-xs">
                <span className="text-white/50">{d.date}</span>
                <span>{d.hands} hands</span>
                <span className={d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {d.pnl >= 0 ? '+' : ''}{formatMoneyWithSymbol(d.pnl)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-black/30 border border-white/10 p-3">
        <p className="text-[10px] uppercase text-white/40 mb-2">All hands ({hands.length})</p>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {hands.map(h => (
            <div key={h.id} className="border-b border-white/5 pb-1">
              <p className="text-[9px] text-white/35">{formatHandTimestamp(h.createdAt)}</p>
              <div className="flex justify-between text-xs text-white/60 gap-1">
                <span className="truncate">{formatHandLine(h)}</span>
                <span className="shrink-0 flex gap-1.5 items-center">
                  {h.action === 'raise' && h.dealerCards.length >= 5 && (
                    <span className={`text-[9px] ${h.dealerQualified ? 'text-amber-400/70' : 'text-sky-400/70'}`}>
                      {h.dealerQualified ? 'Dlr Q' : 'Dlr NQ'}
                    </span>
                  )}
                  <span className={h.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {h.netResult >= 0 ? '+' : ''}{formatMoneyWithSymbol(h.netResult)}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function SessionDetail({ bundle }: { bundle: GameMetricsBundle }) {
  const s = bundle.session
  return (
    <div className="rounded-xl bg-black/30 border border-white/10 px-3">
      <p className="text-[10px] uppercase text-gold pt-2 pb-1">Session stats</p>
      <MetricRow label="Bankroll" value={formatMoneyWithSymbol(s.bankroll)} />
      <MetricRow label="Session P&L" value={`${s.netPnL >= 0 ? '+' : ''}${formatMoneyWithSymbol(s.netPnL)}`} highlight={s.netPnL >= 0 ? 'good' : 'bad'} />
      <MetricRow label="Hands played" value={String(s.handsPlayed)} />
      <MetricRow label="Win rate" value={`${s.winRate.toFixed(1)}%`} sub={`${s.wins}W · ${s.losses}L`} />
      <MetricRow label="Fold rate" value={`${s.foldRate.toFixed(1)}%`} sub={`${s.folds} folds`} />
      <MetricRow label="Play rate" value={`${s.playRate.toFixed(1)}%`} sub={`${s.plays} plays`} />
      <p className="text-xs text-white/40 py-3 text-center">Detailed hand logging coming soon for this game.</p>
    </div>
  )
}

export function MetricsDashboard({ onClose, initialGameId }: MetricsDashboardProps) {
  const [bundles, setBundles] = useState<GameMetricsBundle[]>([])
  const [hands, setHands] = useState<LoggedCaribbeanHand[]>([])
  const [loading, setLoading] = useState(true)
  const [gameId, setGameId] = useState(initialGameId ?? 'caribbean-stud')
  const [adjustments, setAdjustments] = useState<GameMetricsAdjustments>(() => loadAdjustments(gameId))

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await loadAllGameMetrics()
    setBundles(data.bundles)
    setHands(data.caribbeanHands)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    setAdjustments(loadAdjustments(gameId))
  }, [gameId])

  const bundle = bundles.find(b => b.gameId === gameId)
  const ext = bundle?.extended ?? null
  const recs = generateRecommendations(gameId, ext, bundle?.session ?? {
    gameId, handsPlayed: 0, wins: 0, losses: 0, folds: 0, plays: 0,
    netPnL: 0, bankroll: getDisplayBankroll(0), winRate: 0, foldRate: 0, playRate: 0,
  })

  const totalPnL = ext ? ext.totalPnL : bundles.reduce((s, b) => s + b.session.netPnL, 0)
  const totalHands = hands.length || bundles.reduce((s, b) => s + b.handCount, 0)

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      <header className="shrink-0 px-4 pt-[env(safe-area-inset-top,12px)] pb-3 border-b border-white/10">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto w-full">
          <button type="button" onClick={onClose} className="text-sm text-white/50 hover:text-white">← Back</button>
          <h1 className="text-base font-bold">Metrics</h1>
          <button type="button" onClick={refresh} className="text-sm text-gold">Refresh</button>
        </div>
        <div className="max-w-lg mx-auto mt-2 flex gap-3 text-center">
          <div className="flex-1 rounded-lg bg-white/5 py-2">
            <p className={`text-lg font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}{formatMoneyWithSymbol(totalPnL)}
            </p>
            <p className="text-[9px] text-white/40">All games P&L</p>
          </div>
          <div className="flex-1 rounded-lg bg-white/5 py-2">
            <p className="text-lg font-bold">{totalHands}</p>
            <p className="text-[9px] text-white/40">Logged hands</p>
          </div>
          <div className="flex-1 rounded-lg bg-white/5 py-2">
            <p className="text-lg font-bold text-gold">{ext ? formatMoneyWithSymbol(ext.sessionBankroll) : '—'}</p>
            <p className="text-[9px] text-white/40">Bankroll</p>
          </div>
        </div>
      </header>

      <div className="shrink-0 px-4 py-2 border-b border-white/5 overflow-x-auto">
        <div className="flex gap-2 max-w-lg mx-auto">
          {POKER_GAMES.map(g => {
            const b = bundles.find(x => x.gameId === g.id)
            const active = gameId === g.id
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGameId(g.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active ? 'bg-gold text-slate-900' : 'bg-white/10 text-white/60 hover:text-white'
                }`}
              >
                {g.emoji} {b && b.handCount > 0 ? `(${b.handCount})` : ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[env(safe-area-inset-bottom,16px)]">
        <div className="max-w-lg mx-auto">
          {loading ? (
            <p className="text-center text-white/40 py-12">Loading full history…</p>
          ) : !bundle ? (
            <p className="text-center text-white/40 py-12">No data for this game yet.</p>
          ) : (
            <>
              <h2 className="text-lg font-bold mb-3">{bundle.emoji} {bundle.gameName}</h2>

              {ext && ext.totalHands > 0 ? (
                <CaribbeanDetail ext={ext} hands={hands} onRefresh={refresh} />
              ) : (
                <SessionDetail bundle={bundle} />
              )}

              <RecommendationsSection
                gameId={gameId}
                recs={recs}
                adj={adjustments}
                onAdjChange={setAdjustments}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
