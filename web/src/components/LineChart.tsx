import { useEffect, useMemo, useRef, useState } from 'react'
import { shortDate, shortDateTime } from '../lib/time'

export interface Pt { x: number; y: number }
export interface Marker { x: number; label: string }

interface Props {
  points: Pt[]
  yDomain?: [number, number]
  height?: number
  /** Horizontal reference line (e.g. the alarm level). */
  reference?: { y: number; label: string }
  markers?: Marker[]
  formatY?: (v: number) => string
  yTicks?: number[]
  valueLabel: string
  loading?: boolean
  area?: boolean
  compact?: boolean
}

const M = { top: 10, right: 14, bottom: 22, left: 36 }

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1
  const raw = span / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}

export default function LineChart({
  points, yDomain, height = 220, reference, markers = [], formatY = (v) => String(Math.round(v * 100) / 100),
  yTicks, valueLabel, loading, area = true, compact,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.max(240, el.clientWidth)))
    ro.observe(el)
    setWidth(Math.max(240, el.clientWidth))
    return () => ro.disconnect()
  }, [])

  const m = compact ? { ...M, left: 40, bottom: 18 } : M
  const iw = width - m.left - m.right
  const ih = height - m.top - m.bottom

  const view = useMemo(() => {
    if (points.length === 0) return null
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    let [y0, y1] = yDomain ?? [Math.min(...ys), Math.max(...ys)]
    if (!yDomain) { const pad = (y1 - y0) * 0.1 || 1; y0 -= pad; y1 += pad }
    const sx = (x: number) => m.left + (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw)
    const sy = (y: number) => m.top + ih - ((y - y0) / (y1 - y0 || 1)) * ih
    const ticks = yTicks ?? niceTicks(y0, y1, compact ? 3 : 4)
    return { x0, x1, y0, y1, sx, sy, ticks }
  }, [points, yDomain, iw, ih, yTicks, m.left, m.top, compact])

  if (!view) return <div ref={wrap} className={`chartwrap ${loading ? 'loading' : ''}`} style={{ height }} />

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${view.sx(p.x).toFixed(1)},${view.sy(p.y).toFixed(1)}`).join('')
  const base = view.sy(view.y0)
  const areaPath = `${line}L${view.sx(points[points.length - 1].x).toFixed(1)},${base}L${view.sx(points[0].x).toFixed(1)},${base}Z`

  // x ticks: ~4-5 evenly spaced labels, dates when the span is long, times when short
  const span = view.x1 - view.x0
  const nx = compact || width < 520 ? 3 : 5
  const xt = Array.from({ length: nx }, (_, i) => view.x0 + (span * i) / (nx - 1))
  const fmtX = span > 4 * 86400e3 ? shortDate : (ms: number) => shortDateTime(ms).replace(', ', ' ')

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = view.x0 + ((e.clientX - rect.left) / rect.width) * (view.x1 - view.x0)
    let lo = 0, hi = points.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; points[mid].x < x ? (lo = mid) : (hi = mid) }
    setHover(Math.abs(points[lo].x - x) < Math.abs(points[hi].x - x) ? lo : hi)
  }

  const hp = hover !== null ? points[hover] : null
  const last = points[points.length - 1]

  return (
    <div ref={wrap} className={`chartwrap ${loading ? 'loading' : ''}`}>
      <svg className="chart" width={width} height={height} role="img"
        aria-label={`${valueLabel} line chart, ${points.length} points; latest ${formatY(last.y)}`}>
        {view.ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={view.sy(t)} y2={view.sy(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={m.left - 8} y={view.sy(t) + 4} textAnchor="end">{formatY(t)}</text>
          </g>
        ))}
        <line x1={m.left} x2={width - m.right} y1={base} y2={base} stroke="var(--axis)" strokeWidth={1} />
        {xt.map((t, i) => (
          <text key={i} x={view.sx(t)} y={height - 4} textAnchor={i === 0 ? 'start' : i === xt.length - 1 ? 'end' : 'middle'}>{fmtX(t)}</text>
        ))}

        {reference && reference.y >= view.y0 && reference.y <= view.y1 && (
          <g>
            <line x1={m.left} x2={width - m.right} y1={view.sy(reference.y)} y2={view.sy(reference.y)}
              stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={width - m.right} y={view.sy(reference.y) - 5} textAnchor="end">{reference.label}</text>
          </g>
        )}

        {markers.filter((k) => k.x >= view.x0 && k.x <= view.x1).map((k) => (
          <g key={k.x}>
            <line x1={view.sx(k.x)} x2={view.sx(k.x)} y1={m.top} y2={base} stroke="var(--critical)" strokeWidth={2} />
            <text x={view.sx(k.x) - 5} y={m.top + 10} textAnchor="end">{k.label}</text>
          </g>
        ))}

        {area && <path d={areaPath} fill="var(--series-1)" opacity={0.1} />}
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hp && <line x1={view.sx(hp.x)} x2={view.sx(hp.x)} y1={m.top} y2={base} stroke="var(--axis)" strokeWidth={1} />}
        {/* end dot: r=4 with a 2px surface ring */}
        <circle cx={view.sx(hp ? hp.x : last.x)} cy={view.sy(hp ? hp.y : last.y)} r={4} fill="var(--series-1)"
          stroke="var(--surface)" strokeWidth={2} />
        <rect x={m.left} y={m.top} width={iw} height={ih} fill="transparent" tabIndex={0}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(points.length - 1)} onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? points.length - 1) - 1))
            if (e.key === 'ArrowRight') setHover((h) => Math.min(points.length - 1, (h ?? points.length - 1) + 1))
          }} />
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: Math.min(Math.max(view.sx(hp.x) + 12, 0), width - 150), top: Math.max(view.sy(hp.y) - 46, 0) }}>
          <b>{formatY(hp.y)}</b>
          <span>{valueLabel} · {shortDateTime(hp.x)}</span>
        </div>
      )}
    </div>
  )
}
