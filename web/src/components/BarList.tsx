import { useState } from 'react'
import { sensorName } from '../lib/time'
import type { TopSensor } from '../lib/types'

/** Horizontal share bars. Single sequential hue; value at the tip; hover tooltip carries the rest. */
export default function BarList({ items }: { items: TopSensor[] }) {
  const [hover, setHover] = useState<string | null>(null)
  if (items.length === 0) return <div className="empty">No data yet.</div>
  const max = Math.max(...items.map((i) => i.share), 0.01)
  return (
    <div className="bars" role="list">
      {items.map((it) => (
        <div className="bar-row" key={it.sensor} role="listitem" tabIndex={0}
          onPointerEnter={() => setHover(it.sensor)} onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(it.sensor)} onBlur={() => setHover(null)}
          title={`${sensorName(it.sensor)}: ${(it.share * 100).toFixed(1)}% of the deviation`}>
          <span className="name">{sensorName(it.sensor)}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(it.share / max) * 100}%`, opacity: hover && hover !== it.sensor ? 0.55 : 1 }} />
          </div>
          <span className="val">{Math.round(it.share * 100)}%</span>
        </div>
      ))}
    </div>
  )
}
