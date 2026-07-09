import { loadCaribbeanSession, saveCaribbeanSession } from './caribbeanStud'

const STARTING_KEY = 'poker-assist-starting-bankroll'
const ACTUAL_KEY = 'poker-assist-actual-bankroll'

export function getStartingBankroll(): number {
  try {
    const raw = localStorage.getItem(STARTING_KEY)
    if (raw !== null && raw !== '') return Number(raw)
  } catch { /* ignore */ }
  return 0
}

export function setStartingBankroll(amount: number): void {
  localStorage.setItem(STARTING_KEY, String(Math.max(0, amount)))
}

export function getActualBankroll(): number | null {
  try {
    const raw = localStorage.getItem(ACTUAL_KEY)
    if (raw !== null && raw !== '') return Number(raw)
  } catch { /* ignore */ }
  return null
}

export function setActualBankroll(amount: number | null): void {
  if (amount === null) {
    localStorage.removeItem(ACTUAL_KEY)
    return
  }
  localStorage.setItem(ACTUAL_KEY, String(Math.max(0, amount)))
}

/** Bankroll shown in metrics: actual override, or starting + logged P&L. */
export function getDisplayBankroll(totalPnL: number): number {
  const actual = getActualBankroll()
  if (actual !== null) return actual
  return getStartingBankroll() + totalPnL
}

/** Implied starting stack from actual balance and P&L. */
export function impliedStartingBankroll(actual: number, totalPnL: number): number {
  return actual - totalPnL
}

export function adjustActualBankroll(delta: number): void {
  const actual = getActualBankroll()
  if (actual !== null) setActualBankroll(actual + delta)
}

export function syncCaribbeanSessionBankroll(totalPnL: number): void {
  const session = loadCaribbeanSession()
  saveCaribbeanSession({
    ...session,
    bankroll: getDisplayBankroll(totalPnL),
    netPnL: totalPnL,
  })
}
