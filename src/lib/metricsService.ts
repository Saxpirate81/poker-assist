import type {
  ExtendedHandTrends,
  GameMetricsAdjustments,
  GameMetricsBundle,
  GameSessionMetrics,
  MetricRecommendation,
} from '../types/metrics'
import type { LoggedCaribbeanHand } from '../types/handLog'
import { computeTrends, fetchAllCaribbeanHands, coachFollowed } from './handLogService'
import { loadCaribbeanSession } from './caribbeanStud'
import { loadGameSession } from './gameSession'
import { getDisplayBankroll, getStartingBankroll, getActualBankroll } from './bankrollConfig'
import { POKER_GAMES } from '../data/games'

const ADJUSTMENTS_KEY = 'poker-assist-metrics-adjustments'

function streakLengths(hands: LoggedCaribbeanHand[], code: 'W' | 'L'): number {
  let max = 0
  let cur = 0
  for (const h of [...hands].reverse()) {
    const c = h.playerWon ? 'W' : h.action === 'fold' ? 'F' : 'L'
    if (c === code) { cur++; max = Math.max(max, cur) }
    else cur = 0
  }
  return max
}

export function computeExtendedTrends(hands: LoggedCaribbeanHand[]): ExtendedHandTrends {
  const base = computeTrends(hands)
  if (hands.length === 0) {
    return {
      ...base,
      foldRate: 0, raiseRate: 0, raiseWinRate: 0, avgRaiseAmount: 0,
      totalWagered: 0, roiPercent: 0, sessionBankroll: getDisplayBankroll(0),
      aiFollowWinRate: 0, aiIgnoreWinRate: 0, bestWin: 0, worstLoss: 0,
      longestWinStreak: 0, longestLossStreak: 0, cumulativePnL: [], allPnL: [], byDay: [],
    }
  }

  const chronological = [...hands].reverse()
  const allPnL = chronological.map(h => h.netResult)
  let running = 0
  const cumulativePnL = allPnL.map(pnl => { running += pnl; return running })

  const totalWagered = hands.reduce((s, h) => s + h.ante + h.raiseAmount + h.progressiveBet, 0)
  const raises = hands.filter(h => h.action === 'raise')
  const raiseWins = raises.filter(h => h.playerWon).length
  const followHands = hands.filter(h => coachFollowed(h))
  const ignoreHands = hands.filter(h => !coachFollowed(h))
  const followWins = followHands.filter(h => h.playerWon).length
  const ignoreWins = ignoreHands.filter(h => h.playerWon).length

  const dayMap = new Map<string, { hands: number; pnl: number }>()
  for (const h of hands) {
    const date = new Date(h.createdAt).toLocaleDateString()
    const cur = dayMap.get(date) ?? { hands: 0, pnl: 0 }
    dayMap.set(date, { hands: cur.hands + 1, pnl: cur.pnl + h.netResult })
  }

  const caribSession = loadCaribbeanSession()

  return {
    ...base,
    foldRate: (base.folds / hands.length) * 100,
    raiseRate: (base.raises / hands.length) * 100,
    raiseWinRate: raises.length ? (raiseWins / raises.length) * 100 : 0,
    avgRaiseAmount: raises.length ? raises.reduce((s, h) => s + h.raiseAmount, 0) / raises.length : 0,
    totalWagered,
    roiPercent: totalWagered > 0 ? (base.totalPnL / totalWagered) * 100 : 0,
    sessionBankroll: getDisplayBankroll(base.totalPnL),
    startingBankroll: getStartingBankroll(),
    actualBankroll: getActualBankroll(),
    sessionBankrollLocal: caribSession.bankroll,
    aiFollowWinRate: followHands.length ? (followWins / followHands.length) * 100 : 0,
    aiIgnoreWinRate: ignoreHands.length ? (ignoreWins / ignoreHands.length) * 100 : 0,
    bestWin: Math.max(...hands.map(h => h.netResult), 0),
    worstLoss: Math.min(...hands.map(h => h.netResult), 0),
    longestWinStreak: streakLengths(hands, 'W'),
    longestLossStreak: streakLengths(hands, 'L'),
    cumulativePnL,
    allPnL,
    byDay: [...dayMap.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  }
}

function sessionToMetrics(gameId: string, handCount?: number): GameSessionMetrics {
  const s = gameId === 'caribbean-stud'
    ? loadCaribbeanSession()
    : loadGameSession(gameId)
  const plays = 'plays' in s ? s.plays : s.raises
  const played = s.handsPlayed - s.folds
  const handsPlayed = gameId === 'caribbean-stud' && handCount != null ? handCount : s.handsPlayed
  const netPnL = gameId === 'caribbean-stud' && handCount != null
    ? s.netPnL // overwritten by bundle from extended trends
    : s.netPnL
  return {
    gameId,
    handsPlayed,
    wins: s.wins,
    losses: s.losses,
    folds: s.folds,
    plays,
    netPnL,
    bankroll: s.bankroll,
    winRate: played > 0 ? (s.wins / played) * 100 : 0,
    foldRate: handsPlayed > 0 ? (s.folds / handsPlayed) * 100 : 0,
    playRate: handsPlayed > 0 ? (plays / handsPlayed) * 100 : 0,
  }
}

export async function loadAllGameMetrics(): Promise<{
  bundles: GameMetricsBundle[]
  caribbeanHands: LoggedCaribbeanHand[]
}> {
  const caribbeanHands = await fetchAllCaribbeanHands()
  const extended = caribbeanHands.length > 0 ? computeExtendedTrends(caribbeanHands) : null

  const bundles: GameMetricsBundle[] = POKER_GAMES.map(g => {
    const isCs = g.id === 'caribbean-stud'
    const ext = isCs && caribbeanHands.length > 0 ? extended : null
    const session = sessionToMetrics(g.id, isCs ? caribbeanHands.length : undefined)
    if (ext) {
      session.handsPlayed = ext.totalHands
      session.netPnL = ext.totalPnL
      session.bankroll = ext.sessionBankroll
      session.wins = ext.wins
      session.losses = ext.losses
      session.folds = ext.folds
      session.plays = ext.raises
      session.winRate = ext.winRate
      session.foldRate = ext.foldRate
      session.playRate = ext.raiseRate
    }
    return {
      gameId: g.id,
      gameName: g.name,
      emoji: g.emoji,
      session,
      extended: ext,
      handCount: isCs ? caribbeanHands.length : session.handsPlayed,
    }
  })

  return { bundles, caribbeanHands }
}

export function generateRecommendations(
  gameId: string,
  extended: ExtendedHandTrends | null,
  session: GameSessionMetrics
): MetricRecommendation[] {
  const recs: MetricRecommendation[] = []

  if (gameId === 'caribbean-stud' && extended && extended.totalHands >= 5) {
    const t = extended

    if (t.aiFollowRate < 70 && t.followAiPnL > t.ignoreAiPnL + 5) {
      recs.push({
        id: 'follow-ai-more',
        category: 'discipline',
        title: 'Follow AI coach more often',
        detail: `When you follow AI you're ${formatDelta(t.followAiPnL, t.ignoreAiPnL)} ahead vs going against it. Trust the coach on borderline hands.`,
        priority: 'high',
        metricBasis: `Follow AI P&L ${fmt(t.followAiPnL)} vs ignore ${fmt(t.ignoreAiPnL)}`,
      })
    }

    if (t.foldRate > 55 && t.raiseWinRate > 45) {
      recs.push({
        id: 'raise-more',
        category: 'strategy',
        title: 'Consider raising more on playable hands',
        detail: `You fold ${t.foldRate.toFixed(0)}% of hands but win ${t.raiseWinRate.toFixed(0)}% when you raise. You may be folding too often.`,
        priority: 'medium',
        metricBasis: `Fold ${t.foldRate.toFixed(0)}% · raise win ${t.raiseWinRate.toFixed(0)}%`,
      })
    }

    if (t.foldRate < 25 && t.raiseWinRate < 35) {
      recs.push({
        id: 'fold-more',
        category: 'strategy',
        title: 'Tighten up — fold weaker hands',
        detail: `Raise win rate is only ${t.raiseWinRate.toFixed(0)}%. Save chips by folding marginal Ace-high and weak pairs.`,
        priority: 'high',
        metricBasis: `Raise win ${t.raiseWinRate.toFixed(0)}%`,
      })
    }

    if (t.avgAnte > 0 && t.sessionBankroll < t.avgAnte * 20) {
      recs.push({
        id: 'lower-ante',
        category: 'bankroll',
        title: 'Lower your ante size',
        detail: `Stack ($${t.sessionBankroll.toFixed(0)}) is under 20× avg ante ($${t.avgAnte.toFixed(2)}). Drop ante to preserve bankroll.`,
        priority: 'high',
        settingId: 'ante',
        suggestedValue: Math.max(0.25, Math.round(t.avgAnte * 0.5 * 4) / 4),
        metricBasis: `Bankroll ${t.sessionBankroll.toFixed(0)} vs ante ${t.avgAnte.toFixed(2)}`,
      })
    }

    if (t.dealerQualifyRate > 70 && t.losses > t.wins) {
      recs.push({
        id: 'dealer-qualifies-often',
        category: 'strategy',
        title: 'Play stronger when dealer qualifies often',
        detail: `Dealer qualifies ${t.dealerQualifyRate.toFixed(0)}% at showdown. Need stronger made hands — don't raise thin.`,
        priority: 'medium',
        metricBasis: `Dealer qualify ${t.dealerQualifyRate.toFixed(0)}%`,
      })
    }

    if (t.roiPercent < -15 && t.totalHands >= 10) {
      recs.push({
        id: 'take-break',
        category: 'bankroll',
        title: 'Session ROI is negative — review strategy',
        detail: `ROI is ${t.roiPercent.toFixed(1)}% over ${t.totalHands} hands. Check table rules and follow AI on close decisions.`,
        priority: 'high',
        metricBasis: `ROI ${t.roiPercent.toFixed(1)}%`,
      })
    }

    if (t.todayPnL < -20 && t.todayHands >= 5) {
      recs.push({
        id: 'today-down',
        category: 'bankroll',
        title: 'Today is a down day — reduce bet size',
        detail: `Down ${fmt(t.todayPnL)} in ${t.todayHands} hands today. Consider smaller ante until trend reverses.`,
        priority: 'medium',
        settingId: 'ante',
        suggestedValue: Math.max(0.25, Math.round(t.avgAnte * 0.75 * 4) / 4),
        metricBasis: `Today ${fmt(t.todayPnL)}`,
      })
    }
  } else if (session.handsPlayed >= 3) {
    if (session.netPnL < -15) {
      recs.push({
        id: 'session-down',
        category: 'bankroll',
        title: 'Reduce bet size this session',
        detail: `Down ${fmt(session.netPnL)} over ${session.handsPlayed} hands. Lower your base bet to extend play.`,
        priority: 'medium',
        metricBasis: `Session P&L ${fmt(session.netPnL)}`,
      })
    }
    if (session.winRate < 30 && session.plays > 3) {
      recs.push({
        id: 'play-tighter',
        category: 'strategy',
        title: 'Play tighter',
        detail: `Win rate is ${session.winRate.toFixed(0)}%. Follow AI coach recommendations on marginal spots.`,
        priority: 'medium',
        metricBasis: `Win rate ${session.winRate.toFixed(0)}%`,
      })
    }
  }

  return recs
}

function fmt(n: number): string {
  return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
}

function formatDelta(a: number, b: number): string {
  const diff = a - b
  return diff >= 0 ? `${fmt(diff)} better` : `${fmt(diff)} worse`
}

export function loadAdjustments(gameId: string): GameMetricsAdjustments {
  try {
    const raw = localStorage.getItem(ADJUSTMENTS_KEY)
    if (raw) {
      const all = JSON.parse(raw) as Record<string, GameMetricsAdjustments>
      if (all[gameId]) return all[gameId]!
    }
  } catch { /* ignore */ }
  return { gameId, updatedAt: Date.now(), acceptedIds: [], dismissedIds: [], userOverrides: {}, notes: '' }
}

export function saveAdjustments(adj: GameMetricsAdjustments): void {
  try {
    const raw = localStorage.getItem(ADJUSTMENTS_KEY)
    const all: Record<string, GameMetricsAdjustments> = raw ? JSON.parse(raw) : {}
    all[adj.gameId] = { ...adj, updatedAt: Date.now() }
    localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

export function visibleRecommendations(
  recs: MetricRecommendation[],
  adj: GameMetricsAdjustments
): MetricRecommendation[] {
  return recs.filter(r => !adj.dismissedIds.includes(r.id))
}
