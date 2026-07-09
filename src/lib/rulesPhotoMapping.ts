import type { ParsedRulesFromPhoto } from '../types/gameRulesKnowledge'

function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? text.trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(s => s.trim())
}

function asOverrides(v: unknown): Record<string, number | boolean | string> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, number | boolean | string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
      out[k] = val
    }
  }
  return out
}

export function parseRulesVisionResponse(text: string): ParsedRulesFromPhoto | null {
  const data = extractJson(text)
  if (!data || typeof data !== 'object') return null

  const obj = data as Record<string, unknown>
  const rulesSummary = asStringArray(obj.rulesSummary)
  const strategyTips = asStringArray(obj.strategyTips)
  const aiCoachNotes = asStringArray(obj.aiCoachNotes ?? obj.coachNotes ?? obj.houseRules)
  const settingOverrides = asOverrides(obj.settingOverrides ?? obj.settings)
  const dealerQualifyRule = typeof obj.dealerQualifyRule === 'string' ? obj.dealerQualifyRule.trim() : undefined
  const payTableNotes = typeof obj.payTableNotes === 'string' ? obj.payTableNotes.trim()
    : typeof obj.payTable === 'string' ? obj.payTable.trim() : undefined
  const extractSummary = typeof obj.extractSummary === 'string' ? obj.extractSummary.trim()
    : typeof obj.summary === 'string' ? obj.summary.trim() : 'Rules extracted from photo'
  const confidence = typeof obj.confidence === 'number' ? Math.min(1, Math.max(0, obj.confidence)) : 0.75

  if (rulesSummary.length === 0 && strategyTips.length === 0 && aiCoachNotes.length === 0 && !payTableNotes) {
    return null
  }

  return {
    rulesSummary,
    strategyTips,
    aiCoachNotes,
    settingOverrides,
    dealerQualifyRule,
    payTableNotes,
    confidence,
    extractSummary,
  }
}
