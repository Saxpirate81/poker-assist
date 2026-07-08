import type { AiAdvice, Card } from '../types/poker'
import type { HandTrends, LoggedCaribbeanHand } from '../types/handLog'
import type { CaribbeanSession } from './caribbeanStud'
import { getDeviceId, isSupabaseConfigured } from './config'
import { getSupabase } from './supabase'
import { formatCardsShort } from './caribbeanStud'

const LOCAL_LOG_KEY = 'poker-assist-hand-log'

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
  localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(hands.slice(0, 200)))
}

export function didFollowAi(advice: AiAdvice | null, action: 'raise' | 'fold'): boolean {
  if (!advice) return false
  const aiSaysRaise = advice.betAmount !== undefined && advice.betAmount > 0
  return (aiSaysRaise && action === 'raise') || (!aiSaysRaise && action === 'fold')
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

export async function fetchCaribbeanHands(limit = 100): Promise<LoggedCaribbeanHand[]> {
  const supabase = getSupabase()
  if (supabase) {
    const { data, error } = await supabase
      .from('poker_caribbean_hands')
      .select('*')
      .eq('device_id', getDeviceId())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!error && data?.length) {
      const hands = data.map(rowToHand)
      saveLocal(hands)
      return hands
    }
  }
  return loadLocal()
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

const SESSION_START_BANKROLL = 500

export function rebuildSessionFromHands(hands: LoggedCaribbeanHand[]): CaribbeanSession {
  const netPnL = hands.reduce((s, h) => s + h.netResult, 0)
  return {
    bankroll: SESSION_START_BANKROLL + netPnL,
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

export function computeTrends(hands: LoggedCaribbeanHand[]): HandTrends {
  if (hands.length === 0) {
    return { totalHands: 0, wins: 0, losses: 0, folds: 0, raises: 0, totalPnL: 0, aiFollowRate: 0, avgAnte: 0, winRate: 0, recentStreak: '—' }
  }

  const wins = hands.filter(h => h.playerWon).length
  const folds = hands.filter(h => h.action === 'fold').length
  const raises = hands.filter(h => h.action === 'raise').length
  const totalPnL = hands.reduce((s, h) => s + h.netResult, 0)
  const followed = hands.filter(h => h.followedAi).length
  const played = hands.filter(h => h.action === 'raise')
  const winRate = played.length ? (wins / played.length) * 100 : 0

  let streak = ''
  for (const h of hands.slice(0, 10)) {
    if (h.action === 'fold') streak += 'F'
    else if (h.playerWon) streak += 'W'
    else if (h.outcomeSummary.toLowerCase().includes('push')) streak += 'P'
    else streak += 'L'
  }

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
    recentStreak: streak || '—',
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
