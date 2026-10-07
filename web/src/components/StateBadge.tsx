import type { PumpState } from '../lib/types'

export const STATE_META: Record<PumpState, { label: string; color: string; blurb: string }> = {
  healthy: { label: 'Healthy', color: 'var(--good)', blurb: 'Readings match normal operating behaviour.' },
  watch: { label: 'Watch', color: 'var(--watch)', blurb: 'Readings are starting to drift from normal. No action needed yet.' },
  warning: { label: 'Warning', color: 'var(--serious)', blurb: 'Readings are outside normal behaviour. Plan an inspection.' },
  critical: { label: 'Critical', color: 'var(--critical)', blurb: 'Readings are far outside normal behaviour. Inspect now.' },
}

/** Status is always icon + label, never colour alone. */
export function StateIcon({ state, size = 16 }: { state: PumpState; size?: number }) {
  const c = STATE_META[state].color
  const p = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true } as const
  if (state === 'healthy') return <svg {...p}><circle cx="8" cy="8" r="7" fill={c} /><path d="M4.5 8.3l2.3 2.3 4.7-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  if (state === 'watch') return <svg {...p}><circle cx="8" cy="8" r="7" fill={c} /><circle cx="8" cy="8" r="2.4" fill="#0b0b0b" /></svg>
  if (state === 'warning') return <svg {...p}><path d="M8 1.5l7 12.5H1z" fill={c} /><path d="M8 6v4M8 11.6v.4" stroke="#0b0b0b" strokeWidth="1.6" strokeLinecap="round" /></svg>
  return <svg {...p}><path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill={c} /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

export default function StateBadge({ state }: { state: PumpState }) {
  return <span className="badge"><StateIcon state={state} />{STATE_META[state].label}</span>
}
