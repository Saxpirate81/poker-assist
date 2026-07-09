/** Per-game session stats (separate from Caribbean Stud session). */
export interface GameSession {
  bankroll: number
  handsPlayed: number
  wins: number
  losses: number
  folds: number
  plays: number
  netPnL: number
}

const START_BANKROLL = 0

function sessionKey(gameId: string): string {
  return `poker-assist-session-${gameId}`
}

export function loadGameSession(gameId: string): GameSession {
  try {
    const raw = localStorage.getItem(sessionKey(gameId))
    if (raw) return JSON.parse(raw) as GameSession
  } catch { /* ignore */ }
  return {
    bankroll: START_BANKROLL,
    handsPlayed: 0,
    wins: 0,
    losses: 0,
    folds: 0,
    plays: 0,
    netPnL: 0,
  }
}

export function saveGameSession(gameId: string, session: GameSession): void {
  localStorage.setItem(sessionKey(gameId), JSON.stringify(session))
}

export function applySessionResult(
  session: GameSession,
  net: number,
  action: 'fold' | 'play' | 'win' | 'loss'
): GameSession {
  const next: GameSession = {
    ...session,
    handsPlayed: session.handsPlayed + 1,
    netPnL: session.netPnL + net,
    bankroll: session.bankroll + net,
  }
  if (action === 'fold') next.folds += 1
  if (action === 'play') next.plays += 1
  if (net > 0 || action === 'win') next.wins += 1
  if (net < 0 && action !== 'fold') next.losses += 1
  if (action === 'loss') next.losses += 1
  return next
}
