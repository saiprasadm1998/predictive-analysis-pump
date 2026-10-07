import { useCallback, useEffect, useMemo, useState } from 'react'
import Login from './components/Login'
import LineChart from './components/LineChart'
import BarList from './components/BarList'
import FailureCatalog, { MatchLine } from './components/FailureCatalog'
import ModelPage from './components/ModelPage'
import { AlertWorkflow, FeedbackNote, WORKFLOW_TEXT, type WorkflowActions } from './components/AlertWorkflow'
import StateBadge, { STATE_META, StateIcon } from './components/StateBadge'
import { clearToken, hasToken } from './lib/api'
import { useLive } from './lib/useLive'
import { parseT, shortDateTime, sensorName } from './lib/time'
import type { Alert, Workflow } from './lib/types'

const SPEEDS = [10, 30, 60, 120, 360]

function dur(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}

function useTheme() {
  const [theme, setTheme] = useState<string | null>(() => { try { return localStorage.getItem('pg_theme') } catch { return null } })
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme)
    else document.documentElement.removeAttribute('data-theme')
    try { theme ? localStorage.setItem('pg_theme', theme) : localStorage.removeItem('pg_theme') } catch { /* ignore */ }
  }, [theme])
  const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  return { toggle: () => setTheme(dark ? 'light' : 'dark'), dark }
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const live = useLive(onSignOut)
  const { me, catalog, replay, reading, alerts, meta, scenarios, health, sensors } = live
  const canAct = me?.role !== 'viewer'
  const theme = useTheme()
  const [table, setTable] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const [view, setView] = useState<'dashboard' | 'model'>('dashboard')
  const [filter, setFilter] = useState<'all' | Workflow>('all')
  const shown = filter === 'all' ? alerts : alerts.filter((a) => a.workflow === filter)

  const markers = useMemo(
    () => (meta?.evaluation.failures ?? []).map((f) => ({ x: parseT(f.failure), label: 'Failure' })),
    [meta],
  )
  const openAlerts = alerts.filter((a) => a.status === 'open').length
  const ev = meta?.evaluation

  const commitScrub = useCallback(() => {
    if (scrub !== null) { live.seek(new Date(scrub).toISOString().slice(0, 19).replace('T', ' ')); setScrub(null) }
  }, [scrub, live])

  if (!replay || !reading) return <div className="app"><p className="empty">{live.error || 'Connecting to the monitoring service…'}</p></div>

  const state = reading.state
  const startMs = parseT(replay.start), endMs = parseT(replay.end)
  const shownMs = scrub ?? parseT(reading.t)
  const sparkNames = reading.top_sensors.slice(0, 3).map((s) => s.sensor)

  return (
    <div className="app">
      <header className="top">
        <h1>Pump Guardian</h1>
        <span className="asset">Pump P-101 · replaying recorded sensor history (51 sensors)</span>
        {me && <span className="pill">{me.username} · {me.role}</span>}
        <nav className="views" aria-label="Pages">
          <button className={`tab${view === 'dashboard' ? ' on' : ''}`} aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => setView('dashboard')}>Dashboard</button>
          <button className={`tab${view === 'model' ? ' on' : ''}`} aria-current={view === 'model' ? 'page' : undefined} onClick={() => setView('model')}>Model</button>
        </nav>
        <span className="spacer" />
        <button className="btn" onClick={theme.toggle} aria-label="Toggle dark mode">{theme.dark ? 'Light' : 'Dark'} mode</button>
        <button className="btn" onClick={() => { clearToken(); onSignOut() }}>Sign out</button>
      </header>

      {live.error && <div className="banner" role="alert">{live.error}</div>}

      {view === 'model' ? <ModelPage meta={live.meta} me={me} alerts={alerts} onChanged={live.reloadModel} /> : <>
      <section className="controls" aria-label="Replay controls">
        <button className="btn primary" disabled={!canAct} onClick={replay.playing ? live.pause : live.play} style={{ minWidth: 80 }}>
          {replay.playing ? 'Pause' : 'Play'}
        </button>
        <label>Speed
          <select disabled={!canAct} value={replay.speed} onChange={(e) => live.setSpeed(Number(e.target.value))}>
            {[...new Set([...SPEEDS, replay.speed])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>1 s = {s} min</option>)}
          </select>
        </label>
        <label>Jump to
          <select disabled={!canAct} value="" onChange={(e) => { const s = scenarios.find((x) => String(x.id) === e.target.value); if (s) void live.jumpToScenario(s) }}>
            <option value="">a failure run-up…</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {shortDateTime(parseT(s.failure)).split(',')[0]} failure{s.leadHours ? ` (caught ${Math.round(s.leadHours)} h ahead)` : ' (missed)'}
              </option>
            ))}
          </select>
        </label>
        <input className="scrub" type="range" min={startMs} max={endMs} step={3600e3} value={shownMs}
          aria-label="Position in recorded history" disabled={!canAct}
          onChange={(e) => setScrub(Number(e.target.value))} onPointerUp={commitScrub} onKeyUp={commitScrub} />
        <span className="simtime">{shortDateTime(shownMs)}</span>
      </section>

      <div className="grid g-top">
        <section className="card hero" aria-live="polite">
          <h2>Pump health</h2>
          <div className="num">{Math.round(reading.health)}<small>/ 100</small></div>
          <StateBadge state={state} />
          <div className="meter" aria-hidden><i style={{ width: `${reading.health}%`, background: STATE_META[state].color }} /></div>
          <p>{STATE_META[state].blurb}</p>
        </section>

        <div className="grid">
          <div className="tiles">
            <div className="card tile">
              <div className="label">Anomaly level</div>
              <div className="value">{reading.ratio.toFixed(1)}×</div>
              <div className="note">alarm at 1.0×</div>
            </div>
            <div className="card tile">
              <div className="label">Time above alarm level</div>
              <div className="value">{reading.run_above ? dur(reading.run_above) : '—'}</div>
              <div className="note">alerts open after 30 min</div>
            </div>
            <div className="card tile">
              <div className="label">Open alerts</div>
              <div className="value">{openAlerts}</div>
              <div className="note">{alerts.length} raised this replay</div>
            </div>
            <div className="card tile">
              <div className="label">Failures caught early</div>
              <div className="value">{ev ? `${ev.failures_detected} of ${ev.failures_total}` : '—'}</div>
              <div className="note">{ev?.lead_min != null ? `in recorded history, ${Math.round(ev.lead_min)}–${Math.round(ev.lead_max!)} h ahead` : 'in recorded history'}</div>
            </div>
          </div>
        </div>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="head">
          <h2>Health over the last 72 hours</h2>
          <button className="linkish" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'View as table'}</button>
        </div>
        <p className="sub">Lower means further from normal. Below the dashed line the model considers the pump abnormal.</p>
        {!table ? (
          <>
            <div className="legend">
              <span><i className="key-line" />Health score</span>
              <span><i className="key-dash" />Alarm level</span>
              <span><i className="key-fail" />Recorded failure</span>
            </div>
            <LineChart points={health} yDomain={[0, 100]} yTicks={[0, 25, 50, 75, 100]} height={240}
              reference={{ y: 50, label: 'Alarm level' }} markers={markers} valueLabel="Health" loading={live.loadingWindow}
              formatY={(v) => String(Math.round(v))} />
          </>
        ) : (
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            <table>
              <thead><tr><th>Time</th><th className="num">Health</th></tr></thead>
              <tbody>{[...health].reverse().map((p) => <tr key={p.x}><td>{shortDateTime(p.x)}</td><td className="num">{p.y.toFixed(1)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid g-two" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>What is driving the deviation</h2>
          <p className="sub">Share of the current anomaly from each sensor. Highest first.</p>
          <BarList items={reading.top_sensors} />
        </section>
        <section className="card">
          <h2>The top three sensors, last 72 hours</h2>
          <p className="sub">Each chart has its own scale, so shapes are comparable but values are not.</p>
          <div className="spark-grid">
            {sparkNames.map((name) => {
              const s = sensors?.[name] as number[] | undefined
              const t = sensors?.t
              const pts = s && t ? t.map((tt, i) => ({ x: parseT(tt), y: s[i] })).filter((p) => Number.isFinite(p.y)) : []
              return (
                <div className="spark" key={name}>
                  <h3>{sensorName(name)}</h3>
                  <LineChart points={pts} height={92} compact area={false} valueLabel={sensorName(name)}
                    markers={markers} formatY={(v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1))} />
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Alerts</h2>
        <p className="sub">An alert opens when readings stay above the alarm level for 30 minutes, and closes after 3 calm hours.</p>
        <FeedbackNote f={live.feedback} />
        {alerts.length > 0 && (
          <div className="tabs" role="tablist" aria-label="Filter alerts">
            {(['all', 'new', 'investigating', 'resolved'] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={`tab${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : WORKFLOW_TEXT[f]} <span className="hint">{f === 'all' ? alerts.length : alerts.filter((a) => a.workflow === f).length}</span>
              </button>
            ))}
          </div>
        )}
        {alerts.length === 0 ? <div className="empty">No alerts yet. Press Play, or jump to a failure run-up.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Alert</th><th>Opened</th><th className="num">Peak</th><th>Outcome</th><th>Status and verdict</th></tr></thead>
            <tbody>{shown.map((a) => <AlertRow key={a.id} a={a} actions={live} canAct={canAct} thresholds={catalog?.thresholds} />)}</tbody>
          </table></div>
        )}
      </section>

      <FailureCatalog catalog={catalog} />

      <p className="hint" style={{ marginTop: 16 }}>
        Model: distance from normal operating behaviour across 51 sensors, trained on the healthy periods of this dataset.
        {ev && ` Over four months of healthy running it raised about ${ev.healthy_false_alarm_episodes} false alert episodes; results are measured on the same data it learned from, so treat them as optimistic.`}
      </p>
      </>}
    </div>
  )
}

function AlertRow({ a, actions, canAct, thresholds }: { a: Alert; actions: WorkflowActions; canAct: boolean; thresholds?: { possible: number; strong: number } }) {
  const st = a.severity === 'critical' ? 'critical' : 'warning'
  return (
    <tr>
      <td>
        <span className="sev"><StateIcon state={st} />{a.severity === 'critical' ? 'Critical' : 'Warning'}</span>
        <div className="summary">{a.summary}</div>
        <MatchLine match={a.match} thresholds={thresholds} />
      </td>
      <td>{shortDateTime(parseT(a.start))}<div className="hint">{a.status === 'open' ? 'ongoing' : `closed ${shortDateTime(parseT(a.end!))}`}</div></td>
      <td className="num">{a.peakRatio.toFixed(1)}×</td>
      <td>{a.recovery ? 'Pump restarting after a recorded failure' : a.failureAfterHours ? `Failure followed ${a.failureAfterHours} h later` : a.status === 'open' ? 'In progress' : 'No failure within 72 h'}</td>
      <td><AlertWorkflow a={a} actions={actions} canAct={canAct} /></td>
    </tr>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(hasToken())
  const lost = useCallback(() => setAuthed(false), [])
  return authed ? <Dashboard onSignOut={lost} /> : <Login onDone={() => setAuthed(true)} />
}
