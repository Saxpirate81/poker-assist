/** Round to nearest cent and format for display ($0.25, $0.5, $5, $10.50). */
export function formatMoney(amount: number): string {
  const n = Math.round(amount * 100) / 100
  if (Number.isInteger(n)) return String(n)
  const fixed = n.toFixed(2)
  if (fixed.endsWith('0') && !fixed.endsWith('00')) return fixed.slice(0, -1)
  return fixed
}

export function formatMoneyWithSymbol(amount: number): string {
  return `$${formatMoney(amount)}`
}

export function clampAnte(value: number): number {
  return Math.round(Math.max(0.25, Math.min(500, value)) * 100) / 100
}

export function parseMoneyInput(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? clampAnte(n) : 0.25
}
