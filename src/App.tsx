import { useState, useCallback, useEffect } from 'react'
import type { Card, GameRuleSetting, HandState } from './types/poker'
import type { PokerGame } from './types/poker'
import { getGameById } from './data/games'
import { GameSelect } from './components/GameSelect'
import { GameRules } from './components/GameRules'
import { HandBoard } from './components/HandBoard'
import { CaribbeanHandView } from './components/CaribbeanHandView'
import { SettingsPanel } from './components/SettingsPanel'
import { loadCaribbeanRules, saveCaribbeanRules } from './lib/caribbeanStud'

type Screen = 'select' | 'rules' | 'hand'

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
    bankroll: 500,
    history: [],
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>('select')
  const [game, setGame] = useState<PokerGame | null>(null)
  const [rules, setRules] = useState<GameRuleSetting[]>([])
  const [handState, setHandState] = useState<HandState | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const selectGame = (g: PokerGame, skipRules = false) => {
    setGame(g)
    const saved = g.id === 'caribbean-stud' ? loadCaribbeanRules() : null
    const baseRules = g.defaultRules.map(r => ({ ...r }))
    if (saved) {
      setRules(baseRules.map(r => ({ ...r, value: saved[r.id] ?? r.value })))
    } else {
      setRules(baseRules)
    }
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

  const isCaribbeanHand = screen === 'hand' && game?.id === 'caribbean-stud'

  return (
    <div className="app-shell relative">
      {!isCaribbeanHand && (
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

      {screen === 'rules' && game && (
        <GameRules
          game={game}
          rules={rules}
          onChange={setRules}
          onStart={startHand}
          onBack={() => setScreen('select')}
        />
      )}

      {screen === 'hand' && game && handState && game.id === 'caribbean-stud' && (
        <CaribbeanHandView
          game={game}
          state={handState}
          rules={rules}
          onUpdateCards={cards => setHandState(prev => prev ? { ...prev, cards } : prev)}
          onUpdateRules={setRules}
          onNewHand={newHand}
          onBack={() => setScreen('select')}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {screen === 'hand' && game && handState && game.id !== 'caribbean-stud' && (
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
