import { useCallback, useEffect, useRef, useState } from 'react'
import { formatMoneyWithSymbol } from '../lib/money'
import { OUTCOME_FILTER_KEY, OUTCOME_STYLE, formatHandTimestamp, strengthPct } from '../lib/handLogService'
import type { OutcomeTimelineEvent, HandStrengthBlock, HandStrengthPoint } from '../types/handLog'

interface MetricInfoTipProps {
  title: string
  body: string
}

export function MetricInfoTip({ title, body }: MetricInfoTipProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-1 w-4 h-4 rounded-full bg-white/10 text-[10px] text-white/50 hover:text-gold hover:bg-gold/20 inline-flex items-center justify-center shrink-0"
        aria-label={`Info: ${title}`}
      >
        i
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-gold/30 p-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="text-sm font-bold text-gold">{title}</h4>
              <button type="button" onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-lg leading-none">&times;</button>
            </div>
            <p className="text-sm text-white/75 leading-relaxed">{body}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full py-2 rounded-lg bg-gold/20 text-gold text-sm font-semibold"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export interface ChartPointMeta {
  label?: string
  sublabel?: string
}

function formatPnL(v: number): string {
  return `${v >= 0 ? '+' : ''}${formatMoneyWithSymbol(v)}`
}

function sampleIndexed<T>(arr: T[], max: number): { value: T; sourceIndex: number }[] {
  if (arr.length <= max) return arr.map((value, sourceIndex) => ({ value, sourceIndex }))
  const out: { value: T; sourceIndex: number }[] = []
  const step = (arr.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) {
    const sourceIndex = Math.round(i * step)
    out.push({ value: arr[sourceIndex]!, sourceIndex })
  }
  return out
}

const MIN_ZOOM = 0.35
const MAX_ZOOM = 3
const BASE_ITEM_PX = 10
/** Keep bars flush — axis math assumes zero gap between items. */
const CHART_ITEM_GAP = 0

function chartStride(itemPx: number, gap = CHART_ITEM_GAP): number {
  return itemPx + gap
}

function chartContentWidth(count: number, itemPx: number, gap = CHART_ITEM_GAP): number {
  if (count <= 0) return 0
  return count * itemPx + (count - 1) * gap
}

function chartItemCenter(index: number, itemPx: number, gap = CHART_ITEM_GAP): number {
  return index * chartStride(itemPx, gap) + itemPx / 2
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

function useChartZoomScroll(count: number, enabled: boolean) {
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)

  const itemPx = Math.max(4, Math.round(BASE_ITEM_PX * zoom))

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      el.scrollLeft = el.scrollWidth - el.clientWidth
    })
  }, [])

  const zoomIn = useCallback(() => setZoom(z => clampZoom(z * 1.2)), [])
  const zoomOut = useCallback(() => setZoom(z => clampZoom(z / 1.2)), [])

  useEffect(() => {
    if (enabled && count > 0) scrollToEnd()
  }, [count, zoom, enabled, scrollToEnd])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !enabled) return

    const touchDistance = (e: TouchEvent) => {
      const a = e.touches[0]!
      const b = e.touches[1]!
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { distance: touchDistance(e), zoom }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return
      e.preventDefault()
      const dist = touchDistance(e)
      const scale = dist / pinchRef.current.distance
      setZoom(clampZoom(pinchRef.current.zoom * scale))
    }

    const onTouchEnd = () => {
      pinchRef.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [enabled, zoom])

  return { zoom, zoomIn, zoomOut, scrollRef, itemPx, scrollToEnd }
}

function ChartZoomControls({
  title,
  total,
  onZoomIn,
  onZoomOut,
  scrollable,
}: {
  title?: string
  total: number
  onZoomIn: () => void
  onZoomOut: () => void
  scrollable: boolean
}) {
  if (!title && !scrollable) return null
  return (
    <div className="flex items-center justify-between gap-2 mb-1">
      {title ? <p className="text-[10px] text-white/40 flex-1 min-w-0 truncate">{title}</p> : <span className="flex-1" />}
      {scrollable && (
        <>
          <span className="text-[9px] text-white/30 shrink-0 hidden xs:inline">Pinch or ± to zoom</span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onZoomOut}
              className="w-7 h-7 rounded-md bg-white/10 text-white/70 hover:bg-white/20 text-sm font-bold"
              aria-label="Show more hands (denser)"
            >
              −
            </button>
            <span className="text-[9px] text-white/40 min-w-[2.5rem] text-center">{total}</span>
            <button
              type="button"
              onClick={onZoomIn}
              className="w-7 h-7 rounded-md bg-white/10 text-white/70 hover:bg-white/20 text-sm font-bold"
              aria-label="Show fewer hands (wider bars)"
            >
              +
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ChartPointPopup({
  label,
  value,
  sublabel,
  valueLabel,
  formattedValue,
  onDismiss,
}: {
  label?: string
  value: number
  sublabel?: string
  valueLabel?: string
  formattedValue?: string
  onDismiss?: () => void
}) {
  const positive = value >= 0
  const display = formattedValue ?? formatPnL(value)
  return (
    <div className="mt-2 rounded-lg bg-slate-800/95 border border-gold/25 px-3 py-2 shadow-lg relative">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-1.5 right-2 text-white/30 hover:text-white text-sm leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
      <div className="text-center pr-4">
        {label && <p className="text-[10px] uppercase tracking-wide text-white/45">{label}</p>}
        {valueLabel && <p className="text-[10px] text-white/35 mt-0.5">{valueLabel}</p>}
        <p className={`text-base font-bold mt-0.5 ${formattedValue ? 'text-gold' : positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {display}
        </p>
        {sublabel && <p className="text-[10px] text-white/50 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  )
}

function useChartPointInteraction(length: number) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [pinned, setPinned] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const select = useCallback((index: number) => {
    setActiveIndex(prev => {
      if (prev === index) {
        setPinned(false)
        return null
      }
      setPinned(true)
      return index
    })
  }, [])

  const hover = useCallback((index: number | null) => {
    if (pinned) return
    setActiveIndex(index)
  }, [pinned])

  const dismiss = useCallback(() => {
    setActiveIndex(null)
    setPinned(false)
  }, [])

  useEffect(() => {
    if (!pinned) return
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        dismiss()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [pinned, dismiss])

  useEffect(() => {
    if (length === 0) dismiss()
  }, [length, dismiss])

  return { activeIndex, pinned, select, hover, dismiss, containerRef }
}

function resolveMeta(
  meta: ChartPointMeta[] | undefined,
  sourceIndex: number,
  fallbackLabel?: string
): ChartPointMeta {
  const m = meta?.[sourceIndex]
  return {
    label: m?.label ?? fallbackLabel,
    sublabel: m?.sublabel,
  }
}

function formatAxisDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
  } catch {
    return ''
  }
}

function buildHandAxisTicks(count: number, step = 10): number[] {
  if (count <= 0) return []
  const ticks: number[] = [1]
  for (let n = step; n < count; n += step) ticks.push(n)
  if (count > 1) {
    const prev = ticks[ticks.length - 1]!
    if (count !== prev) {
      // Avoid crowding e.g. 260 + 263 when only 3 hands apart
      if (count - prev < step * 0.6 && prev !== 1) ticks.pop()
      if (ticks[ticks.length - 1] !== count) ticks.push(count)
    }
  }
  return ticks
}

/** Bottom axis — hand # every N + date; scrolls with chart content. */
function ChartAxisFooter({
  pointCount,
  itemPx,
  step = 10,
  dates,
  tickLabels,
  handNums,
  mode = 'hand',
}: {
  pointCount: number
  itemPx: number
  step?: number
  dates?: string[]
  tickLabels?: string[]
  /** Actual hand numbers per point (when filtered timeline skips hands) */
  handNums?: number[]
  mode?: 'hand' | 'label'
}) {
  if (pointCount === 0) return null

  const labelStep = mode === 'label'
    ? Math.max(1, Math.ceil(pointCount / 10))
    : step

  const maxHandNum = handNums?.length ? handNums[handNums.length - 1]! : pointCount

  const tickIndices: number[] = mode === 'hand'
    ? buildHandAxisTicks(maxHandNum, step)
        .map(hn => (handNums ? handNums.indexOf(hn) : hn - 1))
        .filter(i => i >= 0 && i < pointCount)
    : (() => {
        const idx: number[] = []
        for (let i = 0; i < pointCount; i += labelStep) idx.push(i)
        if (pointCount > 0 && idx[idx.length - 1] !== pointCount - 1) idx.push(pointCount - 1)
        return idx
      })()

  const contentWidth = chartContentWidth(pointCount, itemPx)

  return (
    <div
      className="relative border-t border-white/10 pt-1 pb-0.5 mt-0.5"
      style={{ width: contentWidth, minHeight: dates?.length ? 28 : 16 }}
    >
      {tickIndices.map(i => {
        const left = chartItemCenter(i, itemPx)
        const handNum = handNums?.[i] ?? i + 1
        const dateStr = dates?.[i] ? formatAxisDate(dates[i]!) : ''

        if (mode === 'label') {
          const raw = tickLabels?.[i] ?? dateStr
          const text = raw.replace(/,\s*\d{4}$/, '')
          return (
            <div
              key={i}
              className="absolute -translate-x-1/2 text-center pointer-events-none select-none"
              style={{ left, maxWidth: Math.max(itemPx * 2.5, 36) }}
            >
              <span className="text-[7px] text-white/45 leading-tight block">{text}</span>
            </div>
          )
        }

        return (
          <div
            key={i}
            className="absolute -translate-x-1/2 text-center pointer-events-none select-none"
            style={{ left, maxWidth: Math.max(itemPx * 2, 32) }}
          >
            <span className="text-[8px] text-white/50 leading-tight block font-medium">{handNum}</span>
            {dateStr && (
              <span className="text-[7px] text-white/30 leading-tight block">{dateStr}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

type ScrollableChartProps = {
  scrollable?: boolean
  /** ISO createdAt per point, oldest → newest */
  axisDates?: string[]
  axisStep?: number
  /** 'hand' = # every 10 · 'label' = use labels array every ~10 */
  axisMode?: 'hand' | 'label'
}

/** SVG line/area chart — fits width or scrolls all points with pinch zoom. */
export function LineChart({
  values,
  meta,
  secondaryValues,
  title,
  valueLabel = 'Running P&L',
  zeroLine = true,
  height = 120,
  scrollable = false,
  axisDates,
  axisStep = 10,
  axisMode = 'hand',
}: {
  values: number[]
  meta?: ChartPointMeta[]
  secondaryValues?: number[]
  title?: string
  valueLabel?: string
  zeroLine?: boolean
  height?: number
  axisDates?: string[]
  axisStep?: number
  axisMode?: 'hand' | 'label'
} & ScrollableChartProps) {
  const { activeIndex, select, hover, dismiss, containerRef } = useChartPointInteraction(values.length)
  const { zoomIn, zoomOut, scrollRef, itemPx } = useChartZoomScroll(values.length, scrollable)

  if (values.length === 0) {
    return <p className="text-xs text-white/40 text-center py-6">No data yet</p>
  }

  const points = scrollable
    ? values.map((value, sourceIndex) => ({ value, sourceIndex }))
    : sampleIndexed(values, 120)

  const pts = points.map(p => p.value)
  const min = Math.min(...pts, 0)
  const max = Math.max(...pts, 0)
  const range = Math.max(max - min, 0.01)
  const h = 100
  const pad = 4

  const coords = points.map(({ value: v, sourceIndex }, i) => {
    const x = scrollable
      ? chartItemCenter(i, itemPx)
      : pad + (i / Math.max(points.length - 1, 1)) * (100 - pad * 2)
    const y = pad + (1 - (v - min) / range) * (h - pad * 2)
    return { x, y, v, sourceIndex, displayIndex: i }
  })

  const lineD = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const chartW = scrollable ? Math.max(chartContentWidth(coords.length, itemPx), 1) : 100
  const areaD = scrollable
    ? `${lineD} L ${coords[coords.length - 1]!.x.toFixed(2)} ${h - pad} L ${coords[0]!.x.toFixed(2)} ${h - pad} Z`
    : `${lineD} L ${coords[coords.length - 1]!.x.toFixed(2)} ${h - pad} L ${coords[0]!.x.toFixed(2)} ${h - pad} Z`
  const zeroY = pad + (1 - (0 - min) / range) * (h - pad * 2)
  const last = coords[coords.length - 1]!.v
  const positive = last >= 0

  const active = activeIndex !== null ? coords[activeIndex] : null
  const activeMeta = active
    ? resolveMeta(meta, active.sourceIndex, `Hand ${active.sourceIndex + 1}`)
    : null
  const activeSecondary = active && secondaryValues ? secondaryValues[active.sourceIndex] : undefined

  const axisFooter = scrollable && points.length > 0 ? (
    <ChartAxisFooter
      pointCount={points.length}
      itemPx={itemPx}
      step={axisStep}
      dates={axisDates}
      mode={axisMode}
    />
  ) : null

  const chartBody = (
    <div className={`relative touch-manipulation ${scrollable ? '' : 'w-full'}`} style={scrollable ? { width: chartW, height } : { height }}>
      <svg
        viewBox={`0 0 ${chartW} ${h}`}
        preserveAspectRatio={scrollable ? 'xMinYMid meet' : 'none'}
        className={`rounded-lg bg-black/20 pointer-events-none ${scrollable ? '' : 'w-full'}`}
        style={{ height, width: scrollable ? chartW : '100%' }}
      >
        {zeroLine && min < 0 && max > 0 && (
          <line x1={scrollable ? 0 : pad} y1={zeroY} x2={chartW - (scrollable ? 0 : pad)} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth="0.3" strokeDasharray="1 1" />
        )}
        <path d={areaD} fill={positive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'} />
        <path d={lineD} fill="none" stroke={positive ? 'rgba(52,211,153,0.9)' : 'rgba(248,113,113,0.9)'} strokeWidth={scrollable ? '1' : '0.6'} vectorEffect="non-scaling-stroke" />
        {active && (
          <>
            <line x1={active.x} y1={pad} x2={active.x} y2={h - pad} stroke="rgba(251,191,36,0.35)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            <circle cx={active.x} cy={active.y} r="2" fill="#fbbf24" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex" style={{ height, width: scrollable ? chartW : '100%' }}>
        {coords.map((p, i) => {
          const pointMeta = resolveMeta(meta, p.sourceIndex, `Hand ${p.sourceIndex + 1}`)
          return (
            <button
              key={p.sourceIndex}
              type="button"
              style={scrollable ? { width: itemPx, flex: 'none' } : undefined}
              className={`${scrollable ? '' : 'flex-1 min-w-0'} h-full bg-transparent border-0 p-0 cursor-crosshair ${
                activeIndex === i ? 'bg-gold/5' : 'hover:bg-white/5'
              }`}
              aria-label={`${pointMeta.label ?? `Point ${p.sourceIndex + 1}`}: ${formatPnL(p.v)}`}
              onMouseEnter={() => hover(i)}
              onMouseLeave={() => hover(null)}
              onClick={() => select(i)}
            />
          )
        })}
      </div>
    </div>
  )

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <ChartZoomControls title={title} total={values.length} onZoomIn={zoomIn} onZoomOut={zoomOut} scrollable={scrollable} />
      {scrollable ? (
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden scroll-smooth rounded-lg -mx-0.5 px-0.5"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div style={{ width: chartW }}>
            {chartBody}
            {axisFooter}
          </div>
        </div>
      ) : (
        chartBody
      )}

      {active && activeMeta ? (
        <ChartPointPopup
          label={activeMeta.label}
          value={active.v}
          valueLabel={valueLabel}
          sublabel={
            activeSecondary !== undefined
              ? `This hand: ${formatPnL(activeSecondary)}`
              : activeMeta.sublabel
          }
          onDismiss={dismiss}
        />
      ) : (
        <div className="flex justify-between text-[9px] text-white/35 mt-1 px-0.5">
          <span>{scrollable ? 'Scroll left for older · pinch ± to zoom' : 'Tap or hover a point'}</span>
          <span className={positive ? 'text-emerald-400' : 'text-red-400'}>
            Latest {formatPnL(last)}
          </span>
        </div>
      )}
    </div>
  )
}

/** Bar chart — hover/tap bars; optional horizontal scroll + pinch zoom for long series. */
export function BarChart({
  values,
  labels,
  meta,
  title,
  valueLabel = 'P&L',
  height = 100,
  scrollable = false,
  axisDates,
  axisStep = 10,
  axisMode = 'hand',
}: {
  values: number[]
  labels?: string[]
  meta?: ChartPointMeta[]
  title?: string
  valueLabel?: string
  height?: number
  axisDates?: string[]
  axisStep?: number
  axisMode?: 'hand' | 'label'
} & ScrollableChartProps) {
  const { activeIndex, select, hover, dismiss, containerRef } = useChartPointInteraction(values.length)
  const { zoomIn, zoomOut, scrollRef, itemPx } = useChartZoomScroll(values.length, scrollable)

  if (values.length === 0) return null

  const points = scrollable
    ? values.map((value, sourceIndex) => ({ value, sourceIndex }))
    : sampleIndexed(values, 30)

  const maxAbs = Math.max(...points.map(p => Math.abs(p.value)), 0.01)
  const innerWidth = scrollable ? chartContentWidth(points.length, itemPx) : undefined

  const active = activeIndex !== null ? points[activeIndex] : null
  const activeMeta = active
    ? resolveMeta(
        meta,
        active.sourceIndex,
        labels?.[active.sourceIndex] ?? `Item ${active.sourceIndex + 1}`
      )
    : null

  const axisFooter = (scrollable || axisDates || labels) && points.length > 0 ? (
    <ChartAxisFooter
      pointCount={points.length}
      itemPx={scrollable ? itemPx : Math.max(4, Math.floor(280 / Math.max(points.length, 1)))}
      step={axisStep}
      dates={axisDates}
      tickLabels={labels}
      mode={axisMode === 'label' || (labels && !axisDates) ? 'label' : 'hand'}
    />
  ) : null

  const bars = (
    <div
      className={`flex items-end ${scrollable ? '' : 'w-full'}`}
      style={{ height, width: innerWidth, minWidth: scrollable ? innerWidth : undefined }}
    >
      {points.map(({ value: v, sourceIndex }, i) => {
        const pct = (Math.abs(v) / maxAbs) * 100
        const isActive = activeIndex === i
        const pointMeta = resolveMeta(meta, sourceIndex, labels?.[sourceIndex])
        return (
          <button
            key={sourceIndex}
            type="button"
            style={scrollable ? { width: itemPx, flex: 'none' } : undefined}
            className={`${scrollable ? '' : 'flex-1 min-w-0'} flex flex-col justify-end h-full p-0 border-0 bg-transparent cursor-pointer rounded-t-sm transition-opacity ${
              isActive ? 'opacity-100 ring-1 ring-gold/50 ring-inset' : 'opacity-90 hover:opacity-100'
            }`}
            aria-label={`${pointMeta.label ?? 'Bar'}: ${formatPnL(v)}`}
            onMouseEnter={() => hover(i)}
            onMouseLeave={() => hover(null)}
            onClick={() => select(i)}
          >
            <div
              className={`w-full rounded-t-sm ${v >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/70'} ${isActive ? 'brightness-125' : ''}`}
              style={{ height: `${Math.max(4, pct)}%` }}
            />
          </button>
        )
      })}
    </div>
  )

  return (
    <div ref={containerRef} className="w-full overflow-hidden touch-manipulation">
      <ChartZoomControls title={title} total={values.length} onZoomIn={zoomIn} onZoomOut={zoomOut} scrollable={scrollable} />
      {scrollable ? (
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden scroll-smooth rounded-lg bg-black/20 -mx-0.5 px-0.5"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div style={{ width: innerWidth }}>
            {bars}
            {axisFooter}
          </div>
        </div>
      ) : (
        <>
          {bars}
          {axisFooter}
        </>
      )}

      {active && activeMeta ? (
        <ChartPointPopup
          label={activeMeta.label}
          value={active.value}
          valueLabel={valueLabel}
          sublabel={activeMeta.sublabel}
          onDismiss={dismiss}
        />
      ) : (
        <p className="text-[9px] text-white/30 mt-1 text-center">
          {scrollable ? 'Scroll for older hands · pinch or ± to zoom · tap a bar' : 'Tap or hover a bar for details'}
        </p>
      )}
    </div>
  )
}

/** Stacked horizontal bar for W/L/F rates — tap segments for detail. */
export function RateBar({ segments }: { segments: { label: string; pct: number; color: string; count?: number }[] }) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const total = segments.reduce((s, x) => s + x.pct, 0) || 1
  const active = segments.find(s => s.label === activeLabel)

  return (
    <div className="w-full touch-manipulation">
      <div className="flex h-8 sm:h-3 rounded-full overflow-hidden bg-white/5">
        {segments.map(s => (
          <button
            key={s.label}
            type="button"
            className={`${s.color} border-0 p-0 min-h-[32px] sm:min-h-0 transition-opacity ${
              activeLabel === s.label ? 'opacity-100 ring-2 ring-gold/60 ring-inset' : 'opacity-90 hover:opacity-100'
            }`}
            style={{ width: `${(s.pct / total) * 100}%` }}
            aria-label={`${s.label}: ${s.pct.toFixed(1)}%`}
            onClick={() => setActiveLabel(prev => (prev === s.label ? null : s.label))}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {segments.map(s => (
          <span key={s.label} className="text-[9px] text-white/50">
            <span className={`inline-block w-2 h-2 rounded-sm mr-1 ${s.color}`} />
            {s.label} {s.pct.toFixed(0)}%
          </span>
        ))}
      </div>
      {active && (
        <ChartPointPopup
          label={active.label}
          value={active.pct}
          formattedValue={`${active.pct.toFixed(1)}%`}
          valueLabel="Rate"
          sublabel={
            active.count !== undefined
              ? `${active.count} hands · ${active.pct.toFixed(1)}% of total`
              : `${active.pct.toFixed(1)}% of hands`
          }
          onDismiss={() => setActiveLabel(null)}
        />
      )}
    </div>
  )
}

function useOutcomeFilter() {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(OUTCOME_FILTER_KEY)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch { /* ignore */ }
    return new Set()
  })

  const toggle = useCallback((id: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(OUTCOME_FILTER_KEY, JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  return { hidden, toggle }
}

function formatPnLShort(v: number): string {
  return `${v >= 0 ? '+' : ''}${formatMoneyWithSymbol(v)}`
}

function groupEventsByDate(events: OutcomeTimelineEvent[]): { date: string; events: OutcomeTimelineEvent[] }[] {
  const map = new Map<string, OutcomeTimelineEvent[]>()
  for (const e of events) {
    const date = new Date(e.createdAt).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    const list = map.get(date) ?? []
    list.push(e)
    map.set(date, list)
  }
  return [...map.entries()].map(([date, evs]) => ({ date, events: evs }))
}

/** Horizontal outcome strip + vertical day-grouped timeline. */
export function OutcomeTimeline({
  events,
  title,
}: {
  events: OutcomeTimelineEvent[]
  title?: string
}) {
  const { hidden, toggle } = useOutcomeFilter()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<'strip' | 'list'>('strip')

  const visible = events.filter(e => !hidden.has(e.filterId))
  const active = activeId ? events.find(e => e.handId === activeId) : null
  const { zoomIn, zoomOut, scrollRef, itemPx } = useChartZoomScroll(visible.length || events.length, true)

  const presentTypes = [...new Set(events.map(e => e.outcomeType))]
  const listGroups = groupEventsByDate([...visible].reverse())

  const stripWidth = Math.max(chartContentWidth(visible.length, itemPx), 1)

  return (
    <div className="w-full touch-manipulation">
      {title && <p className="text-[10px] text-white/40 mb-2">{title}</p>}

      <div className="flex flex-wrap gap-1.5 mb-2">
        {presentTypes.map(type => {
          const style = OUTCOME_STYLE[type]
          const isHidden = hidden.has(style.filterId)
          const count = events.filter(e => e.outcomeType === type).length
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(style.filterId)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] transition-all ${
                isHidden
                  ? 'opacity-40 border-white/10 line-through text-white/40'
                  : 'border-white/20 text-white/70 hover:border-gold/40'
              }`}
              aria-pressed={!isHidden}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isHidden ? '#475569' : style.color }} />
              {style.shortLabel} {count}
            </button>
          )
        })}
      </div>

      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => setView('strip')}
          className={`flex-1 py-1 rounded-lg text-[10px] font-semibold ${view === 'strip' ? 'bg-gold/25 text-gold' : 'bg-white/5 text-white/50'}`}
        >
          Strip view
        </button>
        <button
          type="button"
          onClick={() => setView('list')}
          className={`flex-1 py-1 rounded-lg text-[10px] font-semibold ${view === 'list' ? 'bg-gold/25 text-gold' : 'bg-white/5 text-white/50'}`}
        >
          Timeline list
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-white/40 text-center py-6">No hands logged yet</p>
      ) : view === 'strip' ? (
        <>
          <ChartZoomControls
            title={`${visible.length} of ${events.length} hands · oldest ← → newest`}
            total={events.length}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            scrollable
          />
          <div
            ref={scrollRef}
            className="overflow-x-auto overflow-y-hidden scroll-smooth rounded-lg bg-black/20 -mx-0.5 px-0.5"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div style={{ width: stripWidth }}>
              <div className="flex items-end" style={{ height: 52 }}>
                {visible.map(e => {
                  const isActive = activeId === e.handId
                  return (
                    <button
                      key={e.handId}
                      type="button"
                      style={{ width: itemPx, flex: 'none' }}
                      className={`h-full flex flex-col justify-end items-center p-0 border-0 rounded-t-sm transition-all ${
                        isActive ? 'ring-1 ring-gold/60 brightness-125' : 'hover:brightness-110'
                      }`}
                      onClick={() => setActiveId(prev => (prev === e.handId ? null : e.handId))}
                      aria-label={`Hand ${e.handNum}: ${e.label}`}
                    >
                      <div
                        className="w-full rounded-t-sm flex-1 min-h-[12px]"
                        style={{ background: e.color, opacity: e.netResult >= 0 ? 1 : 0.85 }}
                      />
                      <span className="text-[7px] text-white/45 leading-none py-0.5">{e.shortLabel}</span>
                    </button>
                  )
                })}
              </div>
              <ChartAxisFooter
                pointCount={visible.length}
                itemPx={itemPx}
                step={10}
                dates={visible.map(e => e.createdAt)}
                handNums={visible.map(e => e.handNum)}
                mode="hand"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-lg bg-black/20 border border-white/5">
          {listGroups.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-8">All outcome types hidden — tap keys above</p>
          ) : (
            listGroups.map(group => (
              <div key={group.date} className="border-b border-white/5 last:border-0">
                <p className="text-[10px] font-semibold text-gold/90 px-3 py-2 sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-white/5">
                  {group.date}
                </p>
                <ul className="px-2 pb-2">
                  {group.events.map(e => (
                    <li key={e.handId}>
                      <button
                        type="button"
                        onClick={() => setActiveId(prev => (prev === e.handId ? null : e.handId))}
                        className={`w-full flex items-center gap-2 py-2 px-1 rounded-lg text-left transition-colors ${
                          activeId === e.handId ? 'bg-gold/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: e.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/80">
                            Hand {e.handNum} · <span style={{ color: e.color }}>{e.label}</span>
                          </p>
                          <p className="text-[10px] text-white/40 truncate">
                            {e.playerHand || e.action} · {formatHandTimestamp(e.createdAt)}
                          </p>
                        </div>
                        <span className={`text-xs font-bold shrink-0 ${e.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatPnLShort(e.netResult)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {active && (
        <div className="mt-2 rounded-lg bg-slate-800/95 border border-gold/25 px-3 py-2 relative">
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="absolute top-1.5 right-2 text-white/30 hover:text-white text-sm"
            aria-label="Close"
          >
            ×
          </button>
          <p className="text-[10px] text-white/45 pr-6">
            Hand {active.handNum} · {formatHandTimestamp(active.createdAt)}
          </p>
          <p className="text-sm font-bold mt-0.5" style={{ color: active.color }}>{active.label}</p>
          <p className={`text-base font-bold ${active.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPnLShort(active.netResult)}
          </p>
          <p className="text-[10px] text-white/50 mt-1">{active.playerHand}</p>
          {active.outcomeSummary && (
            <p className="text-[10px] text-white/40 mt-0.5">{active.outcomeSummary}</p>
          )}
        </div>
      )}

      <p className="text-[9px] text-white/30 mt-2 text-center">
        Tap legend to filter · strip scrolls oldest (left) to newest (right)
      </p>
    </div>
  )
}

function strengthWinnerLabel(p: HandStrengthPoint): string {
  if (p.stronger === 'player') return 'You stronger'
  if (p.stronger === 'dealer') return 'Dealer stronger'
  if (p.stronger === 'tie') return 'Same strength'
  return 'Dealer not logged'
}

const STRENGTH_FILTER_KEY = 'poker-assist-strength-filter'

const STRENGTH_LEGEND: {
  stronger: HandStrengthPoint['stronger']
  label: string
  color: string
  short: string
}[] = [
  { stronger: 'player', label: 'You stronger', color: '#34d399', short: 'Y' },
  { stronger: 'dealer', label: 'Dealer stronger', color: '#f87171', short: 'D' },
  { stronger: 'tie', label: 'Tied', color: '#94a3b8', short: 'T' },
  { stronger: 'unknown', label: 'No dealer', color: '#64748b', short: '?' },
]

function useStrengthFilter() {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STRENGTH_FILTER_KEY)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch { /* ignore */ }
    return new Set()
  })

  const toggle = useCallback((id: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(STRENGTH_FILTER_KEY, JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  return { hidden, toggle }
}

function groupStrengthByDate(points: HandStrengthPoint[]): { date: string; hands: HandStrengthPoint[] }[] {
  const map = new Map<string, HandStrengthPoint[]>()
  for (const h of points) {
    const date = new Date(h.createdAt).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    const list = map.get(date) ?? []
    list.push(h)
    map.set(date, list)
  }
  return [...map.entries()].map(([date, hands]) => ({ date, hands }))
}

function StrengthDetailPanel({
  active,
  onClose,
}: {
  active: HandStrengthPoint
  onClose: () => void
}) {
  return (
    <div className="mt-2 rounded-lg bg-slate-800/95 border border-gold/25 px-3 py-2 relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-1.5 right-2 text-white/30 hover:text-white text-sm"
        aria-label="Close"
      >
        ×
      </button>
      <p className="text-[10px] text-white/45 pr-6">
        Hand {active.handNum} · {formatHandTimestamp(active.createdAt)}
      </p>
      <p className="text-sm font-bold mt-0.5 text-gold">{strengthWinnerLabel(active)}</p>
      <div className="grid grid-cols-2 gap-2 mt-1 text-[10px]">
        <div>
          <p className="text-emerald-400/80">You · {active.playerScore}</p>
          <p className="text-white/60 truncate">{active.playerLabel}</p>
        </div>
        <div>
          <p className="text-red-400/80">
            Dealer · {active.dealerScore != null ? active.dealerScore : '—'}
          </p>
          <p className="text-white/60 truncate">{active.dealerLabel ?? 'Not logged'}</p>
        </div>
      </div>
      <p className={`text-sm font-bold mt-1 ${active.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {formatPnLShort(active.netResult)} · {active.action}
      </p>
    </div>
  )
}

function StrengthDualBarHand({
  h,
  maxScore,
  itemPx,
  isActive,
  onSelect,
  showHandNum = true,
}: {
  h: HandStrengthPoint
  maxScore: number
  itemPx?: number
  isActive: boolean
  onSelect: () => void
  showHandNum?: boolean
}) {
  const playerH = (h.playerScore / maxScore) * 100
  const dealerH = h.dealerScore != null ? (h.dealerScore / maxScore) * 100 : 0
  const style = itemPx != null ? { width: itemPx, flex: 'none' as const } : undefined

  return (
    <button
      type="button"
      style={style}
      onClick={onSelect}
      className={`${itemPx == null ? 'flex-1 min-w-0' : ''} flex flex-col items-center justify-end h-full gap-0.5 p-0 border-0 bg-transparent ${
        isActive ? 'opacity-100' : 'opacity-90 hover:opacity-100'
      }`}
      aria-label={`Hand ${h.handNum}: ${strengthWinnerLabel(h)}`}
    >
      <div className="flex items-end justify-center gap-px w-full h-14">
        <div
          className={`w-[42%] rounded-t-sm bg-emerald-500/75 ${isActive ? 'ring-1 ring-gold/50' : ''}`}
          style={{ height: `${Math.max(8, playerH)}%` }}
        />
        <div
          className={`w-[42%] rounded-t-sm ${h.dealerScore != null ? 'bg-red-400/75' : 'bg-white/15 border border-dashed border-white/20'}`}
          style={{ height: `${Math.max(h.dealerScore != null ? 8 : 12, dealerH)}%` }}
        />
      </div>
      {showHandNum && itemPx != null && itemPx >= 14 && (
        <span className="text-[7px] text-white/45 leading-none">{h.handNum}</span>
      )}
    </button>
  )
}

/** You vs dealer hand strength — 10-hand sets, scrollable strip, or day-grouped list. */
export function HandStrengthTimeline({
  blocks,
  blockSize = 10,
}: {
  blocks: HandStrengthBlock[]
  blockSize?: number
}) {
  const [blockIndex, setBlockIndex] = useState(() => Math.max(0, blocks.length - 1))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<'blocks' | 'strip' | 'list'>('blocks')
  const { hidden, toggle } = useStrengthFilter()

  const allPoints = blocks.flatMap(b => b.hands)
  const visiblePoints = allPoints.filter(h => !hidden.has(h.stronger))
  const active = activeId ? allPoints.find(h => h.handId === activeId) ?? null : null

  const { zoomIn, zoomOut, scrollRef, itemPx } = useChartZoomScroll(
    visiblePoints.length || allPoints.length,
    view === 'strip'
  )

  useEffect(() => {
    setBlockIndex(Math.max(0, blocks.length - 1))
  }, [blocks.length])

  if (blocks.length === 0) {
    return <p className="text-xs text-white/40 text-center py-6">Log hands with your 5 cards to see strength trends</p>
  }

  const block = blocks[Math.min(blockIndex, blocks.length - 1)]!
  const maxScoreInBlock = Math.max(
    ...block.hands.flatMap(h => [h.playerScore, h.dealerScore ?? 0]),
    1
  )
  const maxScoreInStrip = Math.max(
    ...visiblePoints.flatMap(h => [h.playerScore, h.dealerScore ?? 0]),
    1
  )
  const stripWidth = Math.max(chartContentWidth(visiblePoints.length, itemPx), 1)
  const listGroups = groupStrengthByDate([...visiblePoints].reverse())

  const dateRange = (() => {
    try {
      const a = new Date(block.dateStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const b = new Date(block.dateEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return a === b ? a : `${a} – ${b}`
    } catch {
      return ''
    }
  })()

  const presentTypes = [...new Set(allPoints.map(h => h.stronger))]

  return (
    <div className="w-full touch-manipulation">
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => setView('blocks')}
          className={`flex-1 py-1 rounded-lg text-[10px] font-semibold ${view === 'blocks' ? 'bg-gold/25 text-gold' : 'bg-white/5 text-white/50'}`}
        >
          Sets of {blockSize}
        </button>
        <button
          type="button"
          onClick={() => setView('strip')}
          className={`flex-1 py-1 rounded-lg text-[10px] font-semibold ${view === 'strip' ? 'bg-gold/25 text-gold' : 'bg-white/5 text-white/50'}`}
        >
          Timeline strip
        </button>
        <button
          type="button"
          onClick={() => setView('list')}
          className={`flex-1 py-1 rounded-lg text-[10px] font-semibold ${view === 'list' ? 'bg-gold/25 text-gold' : 'bg-white/5 text-white/50'}`}
        >
          Timeline list
        </button>
      </div>

      {(view === 'strip' || view === 'list') && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {STRENGTH_LEGEND.filter(l => presentTypes.includes(l.stronger)).map(l => {
            const isHidden = hidden.has(l.stronger)
            const count = allPoints.filter(h => h.stronger === l.stronger).length
            return (
              <button
                key={l.stronger}
                type="button"
                onClick={() => toggle(l.stronger)}
                className={`px-2 py-0.5 rounded-full text-[9px] font-medium border transition-opacity ${
                  isHidden ? 'opacity-40 border-white/10' : 'border-white/20'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-sm mr-1 align-middle"
                  style={{ background: l.color }}
                />
                {l.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {view === 'blocks' && (
        <>
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              type="button"
              disabled={blockIndex <= 0}
              onClick={() => setBlockIndex(i => Math.max(0, i - 1))}
              className="w-8 h-8 rounded-lg bg-white/10 text-white/70 disabled:opacity-30 font-bold"
              aria-label="Older 10 hands"
            >
              ‹
            </button>
            <div className="text-center flex-1 min-w-0">
              <p className="text-xs font-bold text-gold truncate">
                Hands {block.startHand}–{block.endHand}
              </p>
              <p className="text-[9px] text-white/40">
                Set {blockIndex + 1} of {blocks.length} · {blockSize} per page{dateRange ? ` · ${dateRange}` : ''}
              </p>
            </div>
            <button
              type="button"
              disabled={blockIndex >= blocks.length - 1}
              onClick={() => setBlockIndex(i => Math.min(blocks.length - 1, i + 1))}
              className="w-8 h-8 rounded-lg bg-white/10 text-white/70 disabled:opacity-30 font-bold"
              aria-label="Newer 10 hands"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 mb-2 text-center text-[9px]">
            <div className="rounded-lg bg-emerald-950/40 border border-emerald-500/20 py-1.5">
              <p className="font-bold text-emerald-400">{block.playerStrongerCount}</p>
              <p className="text-white/40">You stronger</p>
            </div>
            <div className="rounded-lg bg-red-950/40 border border-red-500/20 py-1.5">
              <p className="font-bold text-red-400">{block.dealerStrongerCount}</p>
              <p className="text-white/40">Dealer stronger</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 py-1.5">
              <p className="font-bold text-white/70">{block.tieCount}</p>
              <p className="text-white/40">Tied</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 py-1.5">
              <p className={`font-bold ${block.blockPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatPnLShort(block.blockPnL)}
              </p>
              <p className="text-white/40">Block P&amp;L</p>
            </div>
          </div>

          {block.avgDealerScore != null && (
            <div className="mb-3 rounded-lg bg-black/30 border border-white/10 p-2">
              <p className="text-[9px] text-white/40 mb-1.5 text-center">Average strength this set (dealer logged)</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-emerald-400/90 w-8 shrink-0">You</span>
                  <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/80 rounded-full"
                      style={{ width: `${strengthPct(block.avgPlayerScore)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-white/50 w-10 text-right shrink-0">{Math.round(block.avgPlayerScore)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-red-400/90 w-8 shrink-0">Dlr</span>
                  <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-red-400/80 rounded-full"
                      style={{ width: `${strengthPct(block.avgDealerScore)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-white/50 w-10 text-right shrink-0">{Math.round(block.avgDealerScore)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-black/20 border border-white/10 p-2 mb-2">
            <div className="flex justify-between text-[8px] text-white/40 mb-1 px-0.5">
              <span className="text-emerald-400/80">You</span>
              <span className="text-red-400/80">Dealer</span>
            </div>
            <div className="flex items-end justify-between gap-0.5" style={{ height: 72 }}>
              {block.hands.map(h => (
                <StrengthDualBarHand
                  key={h.handId}
                  h={h}
                  maxScore={maxScoreInBlock}
                  isActive={activeId === h.handId}
                  onSelect={() => setActiveId(prev => (prev === h.handId ? null : h.handId))}
                />
              ))}
            </div>
          </div>

          <ul className="max-h-40 overflow-y-auto rounded-lg bg-black/20 border border-white/5 divide-y divide-white/5">
            {[...block.hands].reverse().map(h => (
              <li key={h.handId}>
                <button
                  type="button"
                  onClick={() => setActiveId(prev => (prev === h.handId ? null : h.handId))}
                  className={`w-full flex items-start gap-2 py-2 px-2 text-left ${activeId === h.handId ? 'bg-gold/10' : 'hover:bg-white/5'}`}
                >
                  <span className="text-[10px] text-white/40 w-8 shrink-0 pt-0.5">#{h.handNum}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-emerald-400/90 truncate">{h.playerLabel}</p>
                    <p className="text-[10px] text-red-400/80 truncate">
                      {h.dealerLabel ?? 'Dealer not logged'}{h.action === 'fold' ? ' · fold' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[9px] font-semibold ${
                      h.stronger === 'player' ? 'text-emerald-400' : h.stronger === 'dealer' ? 'text-red-400' : 'text-white/40'
                    }`}>
                      {h.stronger === 'player' ? 'You +' : h.stronger === 'dealer' ? 'Dlr +' : h.stronger === 'tie' ? 'Tie' : '—'}
                    </p>
                    <p className={`text-[10px] font-bold ${h.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatPnLShort(h.netResult)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {view === 'strip' && (
        <>
          {visiblePoints.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-8">All strength types hidden — tap keys above</p>
          ) : (
            <>
              <ChartZoomControls
                title={`${visiblePoints.length} of ${allPoints.length} hands · oldest ← → newest`}
                total={visiblePoints.length}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                scrollable
              />
              <div
                ref={scrollRef}
                className="overflow-x-auto overflow-y-hidden scroll-smooth rounded-lg bg-black/20 border border-white/10 p-1 -mx-0.5 px-0.5"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <div style={{ width: stripWidth }}>
                  <div className="flex justify-between text-[8px] text-white/40 mb-0.5 px-0.5">
                    <span className="text-emerald-400/80">You</span>
                    <span className="text-red-400/80">Dealer</span>
                  </div>
                  <div className="flex items-end" style={{ height: 72 }}>
                    {visiblePoints.map(h => (
                      <StrengthDualBarHand
                        key={h.handId}
                        h={h}
                        maxScore={maxScoreInStrip}
                        itemPx={itemPx}
                        isActive={activeId === h.handId}
                        onSelect={() => setActiveId(prev => (prev === h.handId ? null : h.handId))}
                      />
                    ))}
                  </div>
                  <ChartAxisFooter
                    pointCount={visiblePoints.length}
                    itemPx={itemPx}
                    step={10}
                    dates={visiblePoints.map(h => h.createdAt)}
                    handNums={visiblePoints.map(h => h.handNum)}
                    mode="hand"
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {view === 'list' && (
        <div className="max-h-72 overflow-y-auto rounded-lg bg-black/20 border border-white/5">
          {listGroups.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-8">All strength types hidden — tap keys above</p>
          ) : (
            listGroups.map(group => (
              <div key={group.date} className="border-b border-white/5 last:border-0">
                <p className="text-[10px] font-semibold text-gold/90 px-3 py-2 sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-white/5">
                  {group.date}
                </p>
                <ul className="px-2 pb-2">
                  {group.hands.map(h => {
                    const legend = STRENGTH_LEGEND.find(l => l.stronger === h.stronger)
                    return (
                      <li key={h.handId}>
                        <button
                          type="button"
                          onClick={() => setActiveId(prev => (prev === h.handId ? null : h.handId))}
                          className={`w-full flex items-center gap-2 py-2 px-1 rounded-lg text-left transition-colors ${
                            activeId === h.handId ? 'bg-gold/10' : 'hover:bg-white/5'
                          }`}
                        >
                          <span
                            className="w-1.5 self-stretch rounded-full shrink-0"
                            style={{ background: legend?.color ?? '#64748b' }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/80">
                              Hand {h.handNum} · <span style={{ color: legend?.color }}>{strengthWinnerLabel(h)}</span>
                              {h.action === 'fold' ? ' · fold' : ''}
                            </p>
                            <p className="text-[10px] text-white/40 truncate">
                              {h.playerLabel} vs {h.dealerLabel ?? '—'} · {formatHandTimestamp(h.createdAt)}
                            </p>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${h.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatPnLShort(h.netResult)}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {active && <StrengthDetailPanel active={active} onClose={() => setActiveId(null)} />}

      <p className="text-[9px] text-white/30 mt-2 text-center">
        {view === 'blocks'
          ? `‹ › = older / newer sets of ${blockSize} · green = you · red = dealer · dashed = dealer not logged`
          : 'Tap legend to filter · strip scrolls oldest (left) to newest (right) · green/red = you vs dealer bars'}
      </p>
    </div>
  )
}

export interface BreakdownSlice {
  id: string
  label: string
  count: number
  pctOfShowdowns: number
  pctOfRaises: number
  color: string
}

/** Donut + toggle legend — tap key items to hide/show slices. */
export function ToggleBreakdownChart({
  slices,
  title,
  totalRaises,
  showdownHands,
  pctBasis = 'showdown',
}: {
  slices: BreakdownSlice[]
  title?: string
  totalRaises: number
  showdownHands: number
  pctBasis?: 'showdown' | 'raises'
}) {
  const { hidden, toggle } = useOutcomeFilter()
  const [activeId, setActiveId] = useState<string | null>(null)

  const onToggle = (id: string) => {
    toggle(id)
    if (activeId === id) setActiveId(null)
  }

  const visible = slices.filter(s => !hidden.has(s.id))
  const visibleTotal = visible.reduce((s, x) => s + x.count, 0)
  const active = activeId ? slices.find(s => s.id === activeId) : null

  const size = 120
  const cx = size / 2
  const cy = size / 2
  const r = 42
  const circumference = 2 * Math.PI * r
  let cumulative = 0

  const getPct = (s: BreakdownSlice) =>
    pctBasis === 'raises' ? s.pctOfRaises : s.pctOfShowdowns

  return (
    <div className="w-full touch-manipulation">
      {title && <p className="text-[10px] text-white/40 mb-2">{title}</p>}

      {slices.length === 0 ? (
        <p className="text-xs text-white/40 text-center py-6">Raise hands to see outcome mix</p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
                {visibleTotal > 0 && visible.map(s => {
                  const pct = s.count / visibleTotal
                  const segLen = pct * circumference
                  const offset = cumulative
                  cumulative += segLen
                  return (
                    <circle
                      key={s.id}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="14"
                      strokeDasharray={`${segLen} ${circumference - segLen}`}
                      strokeDashoffset={circumference / 4 - offset}
                      className="transition-all duration-300"
                      style={{ opacity: activeId && activeId !== s.id ? 0.35 : 1 }}
                    />
                  )
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {visibleTotal > 0 ? (
                  <>
                    <span className="text-lg font-bold text-gold">{visibleTotal}</span>
                    <span className="text-[8px] text-white/40 uppercase">hands</span>
                  </>
                ) : (
                  <span className="text-[9px] text-white/40 text-center px-2">Tap key to show</span>
                )}
              </div>
            </div>

            <div className="flex-1 w-full space-y-1.5">
              <p className="text-[9px] text-white/35 mb-1">
                {totalRaises} raises · {showdownHands} showdowns · tap to hide/show
              </p>
              {slices.map(s => {
                const isHidden = hidden.has(s.id)
                const isActive = activeId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onToggle(s.id)}
                    onMouseEnter={() => setActiveId(s.id)}
                    onMouseLeave={() => setActiveId(null)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                      isHidden
                        ? 'opacity-40 border-white/5 bg-white/[0.02]'
                        : isActive
                          ? 'border-gold/40 bg-gold/10'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                    aria-pressed={!isHidden}
                  >
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ background: isHidden ? '#475569' : s.color }}
                    />
                    <span className={`flex-1 text-xs ${isHidden ? 'line-through text-white/40' : 'text-white/80'}`}>
                      {s.label}
                    </span>
                    <span className={`text-xs font-bold shrink-0 ${isHidden ? 'text-white/30' : 'text-gold'}`}>
                      {getPct(s).toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-white/35 shrink-0 w-8 text-right">{s.count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {active && !hidden.has(active.id) && (
            <div className="mt-2 rounded-lg bg-slate-800/90 border border-white/10 px-3 py-2 text-center">
              <p className="text-xs font-semibold text-white/80">{active.label}</p>
              <p className="text-sm font-bold text-gold mt-0.5">
                {active.pctOfShowdowns.toFixed(1)}% of showdowns · {active.pctOfRaises.toFixed(1)}% of raises
              </p>
              <p className="text-[10px] text-white/45">{active.count} hands</p>
            </div>
          )}

          <p className="text-[9px] text-white/30 mt-2 text-center">
            Chart uses visible slices only · % = share of showdowns
          </p>
        </>
      )}
    </div>
  )
}
