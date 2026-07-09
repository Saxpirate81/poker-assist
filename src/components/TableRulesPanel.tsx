import { useState } from 'react'
import type { GameRuleSetting, PokerGame } from '../types/poker'
import type { GameRulesKnowledge, ParsedRulesFromPhoto } from '../types/gameRulesKnowledge'
import { RulesPhotoCapture } from './RulesPhotoCapture'
import {
  mergePhotoIntoKnowledge,
  resetGameRulesKnowledge,
  saveGameRulesKnowledge,
  saveRemoteRulesKnowledge,
  syncRulesKnowledgeFromCloud,
} from '../lib/rulesService'
import { isSupabaseConfigured } from '../lib/config'

interface TableRulesPanelProps {
  game: PokerGame
  rules: GameRuleSetting[]
  knowledge: GameRulesKnowledge
  onKnowledgeChange: (knowledge: GameRulesKnowledge) => void
  onRulesChange?: (rules: GameRuleSetting[]) => void
  compact?: boolean
}

export function TableRulesPanel({
  game,
  rules,
  knowledge,
  onKnowledgeChange,
  onRulesChange,
  compact,
}: TableRulesPanelProps) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(!compact)

  const handleRulesParsed = async (parsed: ParsedRulesFromPhoto) => {
    const merged = mergePhotoIntoKnowledge(knowledge, parsed)
    saveGameRulesKnowledge(merged)
    onKnowledgeChange(merged)
    if (onRulesChange && Object.keys(parsed.settingOverrides).length > 0) {
      onRulesChange(rules.map(r => ({
        ...r,
        value: parsed.settingOverrides[r.id] ?? r.value,
      })))
    }
    await saveRemoteRulesKnowledge(merged)
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    const remote = await syncRulesKnowledgeFromCloud(game)
    if (remote) {
      onKnowledgeChange(remote)
      setSyncMsg('Synced latest rules from cloud')
    } else {
      setSyncMsg('No cloud rules found (run Supabase migration?)')
    }
    setSyncing(false)
  }

  const handleReset = () => {
    if (!window.confirm('Reset to default rules? Photo updates will be cleared.')) return
    const fresh = resetGameRulesKnowledge(game)
    onKnowledgeChange(fresh)
    if (onRulesChange) {
      onRulesChange(game.defaultRules.map(r => ({ ...r })))
    }
  }

  const updatedLabel = knowledge.source === 'default'
    ? 'Built-in defaults'
    : `${knowledge.source} · ${new Date(knowledge.updatedAt).toLocaleString()}`

  if (compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full py-1.5 px-2 rounded-lg text-xs bg-white/5 border border-white/10 text-white/60 hover:text-white"
      >
        📋 Table rules ({knowledge.source !== 'default' ? 'custom' : 'default'}) ▾
      </button>
    )
  }

  return (
    <div className={`rounded-xl border border-white/10 bg-black/20 ${compact ? 'p-2 mb-1' : 'p-4 mb-4'}`}>
      {compact && (
        <button type="button" onClick={() => setExpanded(false)} className="text-[10px] text-white/40 mb-1 float-right">▲ hide</button>
      )}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs uppercase tracking-wider text-gold font-semibold">Table rules for AI coach</h3>
        <span className="text-[10px] text-white/40 truncate max-w-[140px]" title={updatedLabel}>{updatedLabel}</span>
      </div>

      <RulesPhotoCapture
        gameId={game.id}
        gameName={game.name}
        onRulesParsed={handleRulesParsed}
      />

      <div className="mt-3 flex gap-2 flex-wrap">
        {isSupabaseConfigured() && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : '☁️ Sync rules'}
          </button>
        )}
        <button
          type="button"
          onClick={handleReset}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60"
        >
          Reset defaults
        </button>
      </div>
      {syncMsg && <p className="mt-2 text-[10px] text-white/50">{syncMsg}</p>}

      {knowledge.payTableNotes && (
        <div className="mt-3 p-2 rounded-lg bg-gold/10 border border-gold/20">
          <p className="text-[10px] uppercase text-gold mb-1">Pay table</p>
          <p className="text-xs text-white/80">{knowledge.payTableNotes}</p>
        </div>
      )}

      {knowledge.dealerQualifyRule && (
        <p className="mt-2 text-xs text-white/70"><span className="text-gold">Dealer qualifies:</span> {knowledge.dealerQualifyRule}</p>
      )}

      <section className="mt-3">
        <p className="text-[10px] uppercase text-white/40 mb-1">How to play</p>
        <ul className="space-y-1">
          {knowledge.rulesSummary.map((rule, i) => (
            <li key={i} className="text-xs text-white/75 flex gap-1.5">
              <span className="text-gold shrink-0">{i + 1}.</span>{rule}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-3">
        <p className="text-[10px] uppercase text-white/40 mb-1">Strategy (feeds AI coach)</p>
        <div className="flex flex-wrap gap-1.5">
          {knowledge.strategyTips.map((tip, i) => (
            <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-emerald-900/40 border border-emerald-500/20 text-emerald-200">
              {tip}
            </span>
          ))}
        </div>
      </section>

      {knowledge.aiCoachNotes.length > 0 && (
        <section className="mt-3">
          <p className="text-[10px] uppercase text-white/40 mb-1">Coach notes</p>
          <ul className="space-y-1">
            {knowledge.aiCoachNotes.map((note, i) => (
              <li key={i} className="text-[11px] text-amber-200/90">• {note}</li>
            ))}
          </ul>
        </section>
      )}

      {knowledge.photoExtractSummary && (
        <p className="mt-2 text-[10px] text-white/35 italic">Last photo: {knowledge.photoExtractSummary}</p>
      )}
    </div>
  )
}
