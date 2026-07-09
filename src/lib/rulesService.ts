import type { GameRuleSetting, PokerGame } from '../types/poker'
import type { GameRulesKnowledge, ParsedRulesFromPhoto } from '../types/gameRulesKnowledge'
import { getSupabase } from './supabase'
import { isSupabaseConfigured } from './config'

const STORAGE_PREFIX = 'poker-assist-rules-knowledge-'

export function createDefaultKnowledge(game: PokerGame): GameRulesKnowledge {
  return {
    gameId: game.id,
    updatedAt: Date.now(),
    source: 'default',
    rulesSummary: [...game.rulesSummary],
    strategyTips: [...game.strategyTips],
    aiCoachNotes: [],
    settingOverrides: {},
  }
}

export function loadGameRulesKnowledge(game: PokerGame): GameRulesKnowledge {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + game.id)
    if (raw) {
      const parsed = JSON.parse(raw) as GameRulesKnowledge
      if (parsed.gameId === game.id) return parsed
    }
  } catch { /* ignore */ }
  return createDefaultKnowledge(game)
}

export function saveGameRulesKnowledge(knowledge: GameRulesKnowledge): void {
  localStorage.setItem(STORAGE_PREFIX + knowledge.gameId, JSON.stringify(knowledge))
}

export function resetGameRulesKnowledge(game: PokerGame): GameRulesKnowledge {
  const fresh = createDefaultKnowledge(game)
  saveGameRulesKnowledge(fresh)
  return fresh
}

export function mergePhotoIntoKnowledge(
  current: GameRulesKnowledge,
  parsed: ParsedRulesFromPhoto
): GameRulesKnowledge {
  return {
    ...current,
    updatedAt: Date.now(),
    source: 'photo',
    rulesSummary: parsed.rulesSummary.length > 0 ? parsed.rulesSummary : current.rulesSummary,
    strategyTips: parsed.strategyTips.length > 0 ? parsed.strategyTips : current.strategyTips,
    aiCoachNotes: [...new Set([...current.aiCoachNotes, ...parsed.aiCoachNotes])],
    settingOverrides: { ...current.settingOverrides, ...parsed.settingOverrides },
    dealerQualifyRule: parsed.dealerQualifyRule ?? current.dealerQualifyRule,
    payTableNotes: parsed.payTableNotes ?? current.payTableNotes,
    photoExtractSummary: parsed.extractSummary,
  }
}

export function applyKnowledgeToRuleSettings(
  baseRules: GameRuleSetting[],
  knowledge: GameRulesKnowledge
): GameRuleSetting[] {
  if (Object.keys(knowledge.settingOverrides).length === 0) return baseRules
  return baseRules.map(r => ({
    ...r,
    value: knowledge.settingOverrides[r.id] ?? r.value,
  }))
}

/** Build a compact rules block injected into AI coach prompts. */
export function buildAiRulesContext(
  game: PokerGame,
  rules: GameRuleSetting[],
  knowledge: GameRulesKnowledge
): string {
  const lines: string[] = [
    `Game: ${game.name}`,
    `Table settings: ${rules.map(r => `${r.id}=${r.value}`).join(', ')}`,
  ]

  if (knowledge.dealerQualifyRule) {
    lines.push(`Dealer qualifies: ${knowledge.dealerQualifyRule}`)
  }
  if (knowledge.payTableNotes) {
    lines.push(`Pay table: ${knowledge.payTableNotes}`)
  }
  if (knowledge.rulesSummary.length > 0) {
    lines.push(`House rules:\n- ${knowledge.rulesSummary.join('\n- ')}`)
  }
  if (knowledge.strategyTips.length > 0) {
    lines.push(`Optimal strategy:\n- ${knowledge.strategyTips.join('\n- ')}`)
  }
  if (knowledge.aiCoachNotes.length > 0) {
    lines.push(`Coach notes:\n- ${knowledge.aiCoachNotes.join('\n- ')}`)
  }
  if (knowledge.source !== 'default') {
    lines.push(`Rules source: ${knowledge.source} (updated ${new Date(knowledge.updatedAt).toLocaleString()})`)
  }

  return lines.join('\n')
}

export async function fetchRemoteRulesKnowledge(gameId: string): Promise<GameRulesKnowledge | null> {
  if (!isSupabaseConfigured()) return null
  const sb = getSupabase()
  if (!sb) return null

  try {
    const { data, error } = await sb
      .from('poker_game_rules')
      .select('game_id, rules_json, source, updated_at')
      .eq('game_id', gameId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data?.rules_json) return null
    const json = data.rules_json as GameRulesKnowledge
    return {
      ...json,
      gameId,
      source: 'remote',
      updatedAt: new Date(data.updated_at as string).getTime(),
    }
  } catch {
    return null
  }
}

export async function saveRemoteRulesKnowledge(knowledge: GameRulesKnowledge): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  const sb = getSupabase()
  if (!sb) return false

  try {
    const { error } = await sb.from('poker_game_rules').insert({
      game_id: knowledge.gameId,
      rules_json: knowledge,
      source: knowledge.source,
      updated_at: new Date(knowledge.updatedAt).toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

export async function syncRulesKnowledgeFromCloud(game: PokerGame): Promise<GameRulesKnowledge | null> {
  const remote = await fetchRemoteRulesKnowledge(game.id)
  if (!remote) return null
  saveGameRulesKnowledge(remote)
  return remote
}
