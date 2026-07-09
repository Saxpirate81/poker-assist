import type { AiAdvice, Card } from '../types/poker'
import type { HandTrends, LoggedCaribbeanHand, DealerStats, BetOutcomeBreakdown, BetOutcomeSlice, OutcomeTimelineEvent, HandOutcomeType } from '../types/handLog'
import type { CaribbeanSession } from './caribbeanStud'
import { getDisplayBankroll } from './bankrollConfig'
import { shouldCaribbeanRaise } from './caribbeanFlow'
import { getDeviceId, isSupabaseConfigured } from './config'
import { getSupabase } from './supabase'
import { formatCardsShort } from './caribbeanStud'

const LOCAL_LOG_KEY = 'poker-assist-hand-log'
/** Local cache cap — cloud holds full history; metrics fetches all pages from Supabase. */
const LOCAL_CACHE_MAX = 10_000

function mergeHandsById(a: LoggedCaribbeanHand[], b: LoggedCaribbeanHand[]): LoggedCaribbeanHand[] {
  const map = new Map<string, LoggedCaribbeanHand>()
  for (const h of [...a, ...b]) map.set(h.id, h)
  return [...map.values()].sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
  )
}

function cardJson(c: Card | null) {
  return c ? { rank: c.rank, suit: c.suit } : null
}

function rowToHand(row: Record<string, unknown>): LoggedCaribbeanHand {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    deviceId: row.device_id as string,
    dealerUpCard: row.dealer_up_card as Card | null,
    playerCards: (row.player_cards as Card[]) ?? [],
    dealerCards: (row.dealer_cards as Card[]) ?? [],
    playerHand: (row.player_hand as string) ?? '',
    dealerHand: (row.dealer_hand as string) ?? '',
    ante: Number(row.ante),
    raiseMultiplier: Number(row.raise_multiplier),
    raiseAmount: Number(row.raise_amount),
    progressiveBet: Number(row.progressive_bet),
    action: row.action as 'raise' | 'fold',
    aiAdvice: row.ai_advice as AiAdvice | null,
    aiProvider: (row.ai_provider as string) ?? 'rules',
    followedAi: Boolean(row.followed_ai),
    netResult: Number(row.net_result),
    outcomeSummary: (row.outcome_summary as string) ?? '',
    dealerQualified: Boolean(row.dealer_qualified),
    playerWon: Boolean(row.player_won),
  }
}

function loadLocal(): LoggedCaribbeanHand[] {
  try {
    const raw = localStorage.getItem(LOCAL_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocal(hands: LoggedCaribbeanHand[]): void {
  try {
    localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(hands.slice(0, LOCAL_CACHE_MAX)))
  } catch {
    // Quota exceeded — keep most recent subset
    localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(hands.slice(0, 2000)))
  }
}

/** Whether stored AI advice recommends raise (matches CaribbeanAnalysisBar). */
export function aiAdviceSaysRaise(advice: AiAdvice): boolean {
  const text = `${advice.recommendedAction ?? ''} ${advice.headline ?? ''} ${advice.detail ?? ''}`.toLowerCase()
  if (/\bfold\b/.test(text)) return false
  if (/\b(raise|max bet|play)\b/.test(text)) return true
  if (advice.verdict === 'bad') return false
  if (advice.betAmount !== undefined) return advice.betAmount > 0
  return false
}

/** Coach recommendation — rules engine when cards are complete (same as on-screen bar). */
export function coachRecommendedRaise(
  playerCards: Card[],
  dealerUp: Card | null,
  advice?: AiAdvice | null
): boolean | null {
  if (playerCards.length === 5 && dealerUp) {
    return shouldCaribbeanRaise(playerCards, dealerUp)
  }
  if (advice) return aiAdviceSaysRaise(advice)
  return null
}

/** Did the player match what the coach recommended? */
export function didFollowCoach(
  action: 'raise' | 'fold',
  playerCards: Card[],
  dealerUp: Card | null,
  advice?: AiAdvice | null
): boolean {
  const recommendRaise = coachRecommendedRaise(playerCards, dealerUp, advice)
  if (recommendRaise === null) return false
  return recommendRaise ? action === 'raise' : action === 'fold'
}

/** @deprecated Use didFollowCoach — kept for callers passing advice only. */
export function didFollowAi(advice: AiAdvice | null, action: 'raise' | 'fold'): boolean {
  if (!advice) return false
  const recommendRaise = aiAdviceSaysRaise(advice)
  return recommendRaise ? action === 'raise' : action === 'fold'
}

/** Effective follow flag — recalculates from cards/advice so historical stats stay accurate. */
export function coachFollowed(hand: LoggedCaribbeanHand): boolean {
  return didFollowCoach(hand.action, hand.playerCards, hand.dealerUpCard, hand.aiAdvice)
}

export async function saveCaribbeanHand(hand: Omit<LoggedCaribbeanHand, 'id' | 'createdAt' | 'deviceId'>): Promise<LoggedCaribbeanHand> {
  const record: LoggedCaribbeanHand = {
    ...hand,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    deviceId: getDeviceId(),
  }

  const local = loadLocal()
  saveLocal([record, ...local])

  const supabase = getSupabase()
  if (supabase) {
    const { error } = await supabase.from('poker_caribbean_hands').insert({
      id: record.id,
      device_id: record.deviceId,
      dealer_up_card: cardJson(record.dealerUpCard),
      player_cards: record.playerCards,
      dealer_cards: record.dealerCards,
      player_hand: record.playerHand,
      dealer_hand: record.dealerHand,
      ante: record.ante,
      raise_multiplier: record.raiseMultiplier,
      raise_amount: record.raiseAmount,
      progressive_bet: record.progressiveBet,
      action: record.action,
      ai_advice: record.aiAdvice,
      ai_provider: record.aiProvider,
      followed_ai: record.followedAi,
      net_result: record.netResult,
      outcome_summary: record.outcomeSummary,
      dealer_qualified: record.dealerQualified,
      player_won: record.playerWon,
    })
    if (error) console.warn('Supabase save failed', error.message)
  }

  return record
}

async function fetchCloudPage(offset: number, pageSize: number, deviceId?: string): Promise<LoggedCaribbeanHand[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  let query = supabase
    .from('poker_caribbean_hands')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (deviceId) query = query.eq('device_id', deviceId)

  const { data, error } = await query
  if (error) {
    console.warn('Supabase fetch page failed', error.message)
    return []
  }
  return (data ?? []).map(rowToHand)
}

/** Fetch every hand from cloud — all devices (personal project). */
async function fetchAllFromCloud(deviceId?: string): Promise<LoggedCaribbeanHand[]> {
  const PAGE = 1000
  const all: LoggedCaribbeanHand[] = []
  let offset = 0

  while (true) {
    const page = await fetchCloudPage(offset, PAGE, deviceId)
    if (page.length === 0) break
    all.push(...page)
    if (page.length < PAGE) break
    offset += PAGE
  }
  return all
}

export async function getHandStorageDiagnostic(): Promise<{
  localCount: number
  cloudCount: number
  cloudCountThisDevice: number
  deviceId: string
  supabaseConfigured: boolean
}> {
  const local = loadLocal()
  const deviceId = getDeviceId()
  const supabaseConfigured = isSupabaseConfigured()

  if (!supabaseConfigured) {
    return {
      localCount: local.length,
      cloudCount: 0,
      cloudCountThisDevice: 0,
      deviceId,
      supabaseConfigured: false,
    }
  }

  const [allCloud, deviceCloud] = await Promise.all([
    fetchAllFromCloud(),
    fetchAllFromCloud(deviceId),
  ])

  return {
    localCount: local.length,
    cloudCount: allCloud.length,
    cloudCountThisDevice: deviceCloud.length,
    deviceId,
    supabaseConfigured: true,
  }
}

export async function fetchCaribbeanHands(limit = 100): Promise<LoggedCaribbeanHand[]> {
  const local = loadLocal()
  const supabase = getSupabase()

  if (supabase) {
    const cloud = await fetchAllFromCloud()
    if (cloud.length > 0) {
      const merged = mergeHandsById(cloud, local)
      saveLocal(merged)
      return merged.slice(0, limit)
    }
  }
  return local.slice(0, limit)
}

/** Fetch every logged hand — full cloud history merged with local cache. */
export async function fetchAllCaribbeanHands(): Promise<LoggedCaribbeanHand[]> {
  const local = loadLocal()
  const cloud = await fetchAllFromCloud()

  if (cloud.length === 0) return local

  const merged = mergeHandsById(cloud, local)
  saveLocal(merged)
  return merged
}

export async function deleteCaribbeanHand(id: string): Promise<LoggedCaribbeanHand[]> {
  const hands = loadLocal().filter(h => h.id !== id)
  saveLocal(hands)

  const supabase = getSupabase()
  if (supabase) {
    const { error } = await supabase
      .from('poker_caribbean_hands')
      .delete()
      .eq('id', id)
      .eq('device_id', getDeviceId())
    if (error) console.warn('Supabase delete failed', error.message)
  }

  return hands
}

export async function clearAllCaribbeanHands(): Promise<LoggedCaribbeanHand[]> {
  saveLocal([])

  const supabase = getSupabase()
  if (supabase) {
    const { error } = await supabase
      .from('poker_caribbean_hands')
      .delete()
      .eq('device_id', getDeviceId())
    if (error) console.warn('Supabase clear failed', error.message)
  }

  return []
}


export function rebuildSessionFromHands(hands: LoggedCaribbeanHand[]): CaribbeanSession {
  const netPnL = hands.reduce((s, h) => s + h.netResult, 0)
  return {
    bankroll: getDisplayBankroll(netPnL),
    handsPlayed: hands.length,
    raises: hands.filter(h => h.action === 'raise').length,
    folds: hands.filter(h => h.action === 'fold').length,
    wins: hands.filter(h => h.playerWon).length,
    losses: hands.filter(h =>
      h.action === 'raise' && !h.playerWon && !h.outcomeSummary.toLowerCase().includes('push')
    ).length,
    netPnL,
    handHistory: [],
  }
}

const EMPTY_DEALER: DealerStats = {
  showdownHands: 0,
  qualifyCount: 0,
  noQualifyCount: 0,
  qualifyRate: 0,
  noQualifyRate: 0,
  playerWinsWhenQual: 0,
  playerLossesWhenQual: 0,
  pushesWhenQual: 0,
  playerWinRateWhenQual: 0,
  dealerWinRateWhenQual: 0,
  pushRateWhenQual: 0,
  winsFromNoQual: 0,
  currentQualifyStreak: '—',
  currentNoQualStreak: '—',
  currentDealerWinStreak: '—',
  longestQualifyStreak: 0,
  longestNoQualStreak: 0,
  longestDealerWinStreak: 0,
  recentShowdownStreak: '—',
}

function isShowdownHand(h: LoggedCaribbeanHand): boolean {
  return h.action === 'raise' && h.dealerCards.length >= 5
}

/** Q=dealer qual · N=no qual · W=you win qual · L=dealer wins qual · T=push */
function dealerShowdownCode(h: LoggedCaribbeanHand): string | null {
  if (!isShowdownHand(h)) return null
  if (!h.dealerQualified) return 'N'
  if (h.outcomeSummary.toLowerCase().includes('push')) return 'T'
  return h.playerWon ? 'W' : 'L'
}

function streakCount(codes: string[], code: string, fromStart: boolean): number {
  const list = fromStart ? codes : [...codes].reverse()
  let count = 0
  for (const c of list) {
    if (c !== code) break
    count++
  }
  return count
}

function longestStreak(codes: string[], code: string): number {
  let max = 0
  let cur = 0
  for (const c of codes) {
    if (c === code) {
      cur++
      max = Math.max(max, cur)
    } else {
      cur = 0
    }
  }
  return max
}

export function computeDealerStats(hands: LoggedCaribbeanHand[]): DealerStats {
  const showdown = hands.filter(isShowdownHand)
  if (showdown.length === 0) return { ...EMPTY_DEALER }

  const qual = showdown.filter(h => h.dealerQualified)
  const noQual = showdown.filter(h => !h.dealerQualified)
  const pushesWhenQual = qual.filter(h => h.outcomeSummary.toLowerCase().includes('push')).length
  const playerWinsWhenQual = qual.filter(h => h.playerWon && !h.outcomeSummary.toLowerCase().includes('push')).length
  const playerLossesWhenQual = qual.filter(h => !h.playerWon && !h.outcomeSummary.toLowerCase().includes('push')).length
  const qualDecided = playerWinsWhenQual + playerLossesWhenQual

  const codesNewestFirst = showdown
    .map(dealerShowdownCode)
    .filter((c): c is string => c !== null)

  const qualCodes = codesNewestFirst.map(c => (c === 'N' ? 'N' : 'Q'))
  const qStreak = streakCount(qualCodes, 'Q', true)
  const nStreak = streakCount(qualCodes, 'N', true)
  const lStreak = streakCount(codesNewestFirst, 'L', true)

  return {
    showdownHands: showdown.length,
    qualifyCount: qual.length,
    noQualifyCount: noQual.length,
    qualifyRate: (qual.length / showdown.length) * 100,
    noQualifyRate: (noQual.length / showdown.length) * 100,
    playerWinsWhenQual,
    playerLossesWhenQual,
    pushesWhenQual,
    playerWinRateWhenQual: qualDecided ? (playerWinsWhenQual / qualDecided) * 100 : 0,
    dealerWinRateWhenQual: qualDecided ? (playerLossesWhenQual / qualDecided) * 100 : 0,
    pushRateWhenQual: qual.length ? (pushesWhenQual / qual.length) * 100 : 0,
    winsFromNoQual: noQual.filter(h => h.playerWon).length,
    currentQualifyStreak: qStreak > 0 ? `${qStreak}Q` : '—',
    currentNoQualStreak: nStreak > 0 ? `${nStreak}N` : '—',
    currentDealerWinStreak: lStreak > 0 ? `${lStreak}L` : '—',
    longestQualifyStreak: longestStreak([...qualCodes].reverse(), 'Q'),
    longestNoQualStreak: longestStreak([...qualCodes].reverse(), 'N'),
    longestDealerWinStreak: longestStreak([...codesNewestFirst].reverse(), 'L'),
    recentShowdownStreak: codesNewestFirst.slice(0, 10).join('') || '—',
  }
}

/** Outcome mix for raised hands — used in toggle donut chart. */
export function computeBetOutcomeBreakdown(hands: LoggedCaribbeanHand[]): BetOutcomeBreakdown {
  const raises = hands.filter(h => h.action === 'raise')
  const showdown = raises.filter(isShowdownHand)
  const totalRaises = raises.length
  const showdownHands = showdown.length

  const noQual = showdown.filter(h => !h.dealerQualified)
  const qual = showdown.filter(h => h.dealerQualified)
  const pushes = qual.filter(h => h.outcomeSummary.toLowerCase().includes('push'))
  const youWinQual = qual.filter(h => h.playerWon && !h.outcomeSummary.toLowerCase().includes('push'))
  const dealerWinQual = qual.filter(h => !h.playerWon && !h.outcomeSummary.toLowerCase().includes('push'))
  const incomplete = totalRaises - showdownHands

  const pctShowdown = (n: number) => (showdownHands ? (n / showdownHands) * 100 : 0)
  const pctRaise = (n: number) => (totalRaises ? (n / totalRaises) * 100 : 0)

  const slices: BetOutcomeSlice[] = [
    {
      id: 'dealer-no-qual',
      label: 'Dealer no qualify',
      count: noQual.length,
      pctOfShowdowns: pctShowdown(noQual.length),
      pctOfRaises: pctRaise(noQual.length),
      color: '#38bdf8',
    },
    {
      id: 'you-win-showdown',
      label: 'You won (showdown)',
      count: youWinQual.length,
      pctOfShowdowns: pctShowdown(youWinQual.length),
      pctOfRaises: pctRaise(youWinQual.length),
      color: '#34d399',
    },
    {
      id: 'dealer-win-showdown',
      label: 'Dealer won (showdown)',
      count: dealerWinQual.length,
      pctOfShowdowns: pctShowdown(dealerWinQual.length),
      pctOfRaises: pctRaise(dealerWinQual.length),
      color: '#f87171',
    },
    {
      id: 'push',
      label: 'Push (tie)',
      count: pushes.length,
      pctOfShowdowns: pctShowdown(pushes.length),
      pctOfRaises: pctRaise(pushes.length),
      color: '#94a3b8',
    },
  ]

  if (incomplete > 0) {
    slices.push({
      id: 'incomplete',
      label: 'Raise — dealer not logged',
      count: incomplete,
      pctOfShowdowns: 0,
      pctOfRaises: pctRaise(incomplete),
      color: '#475569',
    })
  }

  return {
    totalRaises,
    showdownHands,
    slices: slices.filter(s => s.count > 0),
  }
}

export const OUTCOME_FILTER_KEY = 'poker-assist-bet-outcome-hidden'

export const OUTCOME_STYLE: Record<
  HandOutcomeType,
  { filterId: string; label: string; shortLabel: string; color: string }
> = {
  fold: { filterId: 'fold', label: 'Fold', shortLabel: 'F', color: '#f59e0b' },
  'dealer-no-qual': { filterId: 'dealer-no-qual', label: 'Dealer no qualify', shortLabel: 'NQ', color: '#38bdf8' },
  'you-win-showdown': { filterId: 'you-win-showdown', label: 'You won (showdown)', shortLabel: 'W', color: '#34d399' },
  'dealer-win-showdown': { filterId: 'dealer-win-showdown', label: 'Dealer won (showdown)', shortLabel: 'L', color: '#f87171' },
  push: { filterId: 'push', label: 'Push (tie)', shortLabel: 'T', color: '#94a3b8' },
  incomplete: { filterId: 'incomplete', label: 'Raise — dealer not logged', shortLabel: '?', color: '#475569' },
}

export function classifyHandOutcome(h: LoggedCaribbeanHand): HandOutcomeType {
  if (h.action === 'fold') return 'fold'
  if (!isShowdownHand(h)) return 'incomplete'
  if (!h.dealerQualified) return 'dealer-no-qual'
  if (h.outcomeSummary.toLowerCase().includes('push')) return 'push'
  if (h.playerWon) return 'you-win-showdown'
  return 'dealer-win-showdown'
}

/** Chronological outcome events (oldest → newest) for timeline chart. */
export function buildOutcomeTimeline(hands: LoggedCaribbeanHand[]): OutcomeTimelineEvent[] {
  const chrono = [...hands].reverse()
  return chrono.map((h, i) => {
    const outcomeType = classifyHandOutcome(h)
    const style = OUTCOME_STYLE[outcomeType]
    return {
      handNum: i + 1,
      handId: h.id,
      createdAt: h.createdAt,
      outcomeType,
      filterId: style.filterId,
      label: style.label,
      shortLabel: style.shortLabel,
      color: style.color,
      netResult: h.netResult,
      playerHand: h.playerHand,
      action: h.action,
      outcomeSummary: h.outcomeSummary,
    }
  })
}

/** Space-separated showdown codes for display, e.g. "W W W N W L". */
export function formatShowdownStreak(streak: string): string {
  if (!streak || streak === '—') return streak
  return streak.split('').join(' ')
}

const EMPTY_TRENDS: HandTrends = {
  totalHands: 0, wins: 0, losses: 0, folds: 0, raises: 0, totalPnL: 0,
  aiFollowRate: 0, avgAnte: 0, winRate: 0, recentStreak: '—', currentStreak: '—',
  dealerQualifyRate: 0, todayHands: 0, todayPnL: 0, recentPnL: [],
  followAiPnL: 0, ignoreAiPnL: 0,
  dealer: { ...EMPTY_DEALER },
}

function streakCode(h: LoggedCaribbeanHand): string {
  if (h.action === 'fold') return 'F'
  if (h.playerWon) return 'W'
  if (h.outcomeSummary.toLowerCase().includes('push')) return 'P'
  return 'L'
}

export function computeTrends(hands: LoggedCaribbeanHand[]): HandTrends {
  if (hands.length === 0) return { ...EMPTY_TRENDS }

  const wins = hands.filter(h => h.playerWon).length
  const folds = hands.filter(h => h.action === 'fold').length
  const raises = hands.filter(h => h.action === 'raise').length
  const totalPnL = hands.reduce((s, h) => s + h.netResult, 0)
  const followed = hands.filter(h => coachFollowed(h)).length
  const showdown = hands.filter(isShowdownHand)
  const winRate = showdown.length
    ? (showdown.filter(h => h.playerWon).length / showdown.length) * 100
    : 0

  let recentStreak = ''
  for (const h of hands.slice(0, 10)) {
    recentStreak += streakCode(h)
  }

  let currentStreak = '—'
  if (hands.length > 0) {
    const first = streakCode(hands[0]!)
    let count = 1
    for (let i = 1; i < hands.length; i++) {
      if (streakCode(hands[i]!) !== first) break
      count++
    }
    currentStreak = `${count}${first}`
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayHandsList = hands.filter(h => new Date(h.createdAt) >= todayStart)
  const showdownHands = hands.filter(isShowdownHand)
  const dealerQualifyRate = showdownHands.length
    ? (showdownHands.filter(h => h.dealerQualified).length / showdownHands.length) * 100
    : 0
  const dealer = computeDealerStats(hands)

  return {
    totalHands: hands.length,
    wins,
    losses: hands.filter(h =>
      h.action === 'raise' && !h.playerWon && !h.outcomeSummary.toLowerCase().includes('push')
    ).length,
    folds,
    raises,
    totalPnL,
    aiFollowRate: hands.length ? (followed / hands.length) * 100 : 0,
    avgAnte: hands.reduce((s, h) => s + h.ante, 0) / hands.length,
    winRate,
    recentStreak: recentStreak || '—',
    currentStreak,
    dealerQualifyRate,
    todayHands: todayHandsList.length,
    todayPnL: todayHandsList.reduce((s, h) => s + h.netResult, 0),
    recentPnL: hands.slice(0, 10).reverse().map(h => h.netResult),
    followAiPnL: hands.filter(h => coachFollowed(h)).reduce((s, h) => s + h.netResult, 0),
    ignoreAiPnL: hands.filter(h => !coachFollowed(h)).reduce((s, h) => s + h.netResult, 0),
    dealer,
  }
}

export function formatHandTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function formatHandLine(h: LoggedCaribbeanHand): string {
  const cards = formatCardsShort(h.playerCards)
  const pnl = h.netResult >= 0 ? `+${h.netResult}` : String(h.netResult)
  return `${cards} · ${h.action} · ${pnl}`
}

export function getStorageStatus(): { local: boolean; cloud: boolean } {
  return { local: loadLocal().length > 0, cloud: isSupabaseConfigured() }
}
