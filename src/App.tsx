import { useState, useCallback, useEffect } from 'react'
import type { Card, GameRuleSetting, HandState } from './types/poker'
import type { PokerGame } from './types/poker'
import type { GameRulesKnowledge } from './types/gameRulesKnowledge'
import { getGameById } from './data/games'
import { GameSelect } from './components/GameSelect'
import { GameRules } from './components/GameRules'
import { HandBoard } from './components/HandBoard'
import { CaribbeanHandView } from './components/CaribbeanHandView'
import { ThreeCardHandView } from './components/ThreeCardHandView'
import { VideoPokerHandView } from './components/VideoPokerHandView'
import { HoldemHandView, OmahaHandView } from './components/StreetHandView'
import { SettingsPanel } from './components/SettingsPanel'
import { loadCaribbeanRules, saveCaribbeanRules } from './lib/caribbeanStud'
import {
  applyKnowledgeToRuleSettings,
  loadGameRulesKnowledge,
  saveGameRulesKnowledge,
  syncRulesKnowledgeFromCloud,
} from './lib/rulesService'
import { loadAdjustments } from './lib/metricsService'

type Screen = 'select' | 'rules' | 'hand'

const DEDICATED_HAND_GAMES = new Set([
  'caribbean-stud',
  'three-card-poker',
  'video-poker',
  'texas-holdem',
  'omaha',
])

function createInitialHand(game: PokerGame): HandState {
  const allSlots = [
    ...game.playerSlots,
    ...(game.dealerSlots ?? []),
    ...(game.communitySlots ?? []),
  ]
  const cards: Record<string, Card | null> = {}
  allSlots.forEach(s => { cards[s.id] = null })

  return {
    gameId: game.id,
    cards,
    currentRound: game.bettingRounds[0],
    roundIndex: 0,
    pot: 0,
    playerBet: 0,
    dealerBet: 0,
    bankroll: 0,
    history: [],
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>('select')
  const [game, setGame] = useState<PokerGame | null>(null)
  const [rules, setRules] = useState<GameRuleSetting[]>([])
  const [rulesKnowledge, setRulesKnowledge] = useState<GameRulesKnowledge | null>(null)
  const [handState, setHandState] = useState<HandState | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const selectGame = async (g: PokerGame, skipRules = false) => {
    setGame(g)
    let knowledge = loadGameRulesKnowledge(g)
    const cloud = await syncRulesKnowledgeFromCloud(g)
    if (cloud) knowledge = cloud

    const saved = g.id === 'caribbean-stud' ? loadCaribbeanRules() : null
    let baseRules = g.defaultRules.map(r => ({ ...r }))
    baseRules = applyKnowledgeToRuleSettings(baseRules, knowledge)
    if (saved) {
      baseRules = baseRules.map(r => ({ ...r, value: saved[r.id] ?? r.value }))
    }
    const metricAdj = loadAdjustments(g.id)
    if (Object.keys(metricAdj.userOverrides).length > 0) {
      baseRules = baseRules.map(r => ({
        ...r,
        value: metricAdj.userOverrides[r.id] ?? r.value,
      }))
    }
    setRulesKnowledge(knowledge)
    setRules(baseRules)
    if (skipRules || g.id === 'caribbean-stud') {
      setHandState(createInitialHand(g))
      setScreen('hand')
    } else {
      setScreen('rules')
    }
  }

  const quickStartCaribbean = () => {
    const g = getGameById('caribbean-stud')
    if (g) selectGame(g, true)
  }

  useEffect(() => {
    if (rulesKnowledge) saveGameRulesKnowledge(rulesKnowledge)
  }, [rulesKnowledge])

  useEffect(() => {
    if (game?.id === 'caribbean-stud') {
      const map: Record<string, number | boolean | string> = {}
      rules.forEach(r => { map[r.id] = r.value })
      saveCaribbeanRules(map)
    }
  }, [rules, game?.id])

  const startHand = () => {
    if (!game) return
    setHandState(createInitialHand(game))
    setScreen('hand')
  }

  const newHand = useCallback(() => {
    if (!game) return
    setHandState(createInitialHand(game))
  }, [game])

  const isDedicatedHand = screen === 'hand' && game != null && DEDICATED_HAND_GAMES.has(game.id)

  return (
    <div className="app-shell relative">
      {!isDedicatedHand && (
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="fixed top-3 right-3 z-40 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg backdrop-blur-sm border border-white/10"
          aria-label="Settings"
        >
          ⚙️
        </button>
      )}

      {screen === 'select' && (
        <GameSelect onSelect={g => selectGame(g, false)} onQuickStartCaribbean={quickStartCaribbean} />
      )}

      {screen === 'rules' && game && rulesKnowledge && (
        <GameRules
          game={game}
          rules={rules}
          rulesKnowledge={rulesKnowledge}
          onChange={setRules}
          onKnowledgeChange={setRulesKnowledge}
          onStart={startHand}
          onBack={() => setScreen('select')}
        />
      )}

      {screen === 'hand' && game && handState && rulesKnowledge && game.id === 'caribbean-stud' && (
        <CaribbeanHandView
          game={game}
          state={handState}
          rules={rules}
          rulesKnowledge={rulesKnowledge}
          onUpdateCards={cards => setHandState(prev => prev ? { ...prev, cards } : prev)}
          onUpdateRules={setRules}
          onKnowledgeChange={setRulesKnowledge}
          onNewHand={newHand}
          onBack={() => setScreen('select')}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {screen === 'hand' && game && handState && rulesKnowledge && game.id === 'three-card-poker' && (
        <ThreeCardHandView
          game={game}
          state={handState}
          rules={rules}
          rulesKnowledge={rulesKnowledge}
          onUpdateCards={cards => setHandState(prev => prev ? { ...prev, cards } : prev)}
          onUpdateRules={setRules}
          onNewHand={newHand}
          onBack={() => setScreen('select')}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {screen === 'hand' && game && handState && rulesKnowledge && game.id === 'video-poker' && (
        <VideoPokerHandView
          game={game}
          state={handState}
          rules={rules}
          rulesKnowledge={rulesKnowledge}
          onUpdateCards={cards => setHandState(prev => prev ? { ...prev, cards } : prev)}
          onUpdateRules={setRules}
          onNewHand={newHand}
          onBack={() => setScreen('select')}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {screen === 'hand' && game && handState && rulesKnowledge && game.id === 'texas-holdem' && (
        <HoldemHandView
          game={game}
          state={handState}
          rules={rules}
          rulesKnowledge={rulesKnowledge}
          onUpdateCards={cards => setHandState(prev => prev ? { ...prev, cards } : prev)}
          onUpdateRound={(round, roundIndex) => setHandState(prev => prev ? { ...prev, currentRound: round, roundIndex } : prev)}
          onNewHand={newHand}
          onBack={() => setScreen('select')}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {screen === 'hand' && game && handState && rulesKnowledge && game.id === 'omaha' && (
        <OmahaHandView
          game={game}
          state={handState}
          rules={rules}
          rulesKnowledge={rulesKnowledge}
          onUpdateCards={cards => setHandState(prev => prev ? { ...prev, cards } : prev)}
          onUpdateRound={(round, roundIndex) => setHandState(prev => prev ? { ...prev, currentRound: round, roundIndex } : prev)}
          onNewHand={newHand}
          onBack={() => setScreen('select')}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {screen === 'hand' && game && handState && !DEDICATED_HAND_GAMES.has(game.id) && (
        <HandBoard
          game={game}
          state={handState}
          rules={rules}
          onUpdateCards={cards => setHandState(prev => prev ? { ...prev, cards } : prev)}
          onUpdateRules={setRules}
          onUpdateRound={(round, roundIndex) => setHandState(prev => prev ? { ...prev, currentRound: round, roundIndex } : prev)}
          onLogAction={(action, amount) => setHandState(prev => {
            if (!prev) return prev
            return {
              ...prev,
              history: [...prev.history, { round: prev.currentRound, action, amount }],
              playerBet: amount ? prev.playerBet + amount : prev.playerBet,
              pot: amount ? prev.pot + amount : prev.pot,
            }
          })}
          onNewHand={newHand}
          onBack={() => setScreen('rules')}
        />
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
