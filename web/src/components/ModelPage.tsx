import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Alert, CurveRow, Me, Meta, ModelRun, Preview, RetrainResult } from '../lib/types'
import { parseT, shortDate, shortDateTime } from '../lib/time'

const MIN = 0.5, MAX = 3, STEP = 0.05

interface Props { meta: Meta | null; me: Me | null; alerts: Alert[]; onChanged: () => Promise<void> }

const fmtLevel = (n: number) => `${n.toFixed(2).replace(/0$/, '')}×`
const runTime = (iso: string) => shortDateTime(parseT(iso.slice(0, 19).replace('T', ' ')))
const TRIGGER: Record<ModelRun['trigger'], string> = { startup: 'Service start', sensitivity: 'Sensitivity changed', retrain: 'Retrained' }

export default function ModelPage({ meta, me, alerts, onChanged }: Props) {
  const isAdmin = me?.role === 'admin'
  const current = meta?.level ?? 1
  const [level, setLevel] = useState(current)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [curve, setCurve] = useState<CurveRow[]>([])
  const [runs, setRuns] = useState<ModelRun[]>([])
  const [busy, setBusy] = useState<'' | 'apply' | 'retrain'>('')
  const [sure, setSure] = useState(false)
  const [result, setResult] = useState<RetrainResult | null>(null)
  const [error, setError] = useState('')
  const seq = useRef(0)

  useEffect(() => { setLevel(current) }, [current])

  // re-run the recorded history whenever the slider settles
  useEffect(() => {
    const n = ++seq.current
    const id = setTimeout(() => {
      api.preview(level).then((p) => { if (n === seq.current) setPreview(p) }).catch(() => setError('Could not reach the model service.'))
    }, 200)
    return () => clearTimeout(id)
  }, [level, meta])

  const loadRuns = useCallback(() => { api.runs().then(setRuns).catch(() => { /* optional */ }) }, [])
  useEffect(() => { api.curve().then(setCurve).catch(() => { /* optional */ }); loadRuns() }, [loadRuns, meta])

  const falseN = alerts.filter((a) => a.label === 'false_alarm').length
  const realN = alerts.filter((a) => a.label === 'real_issue').length

  const apply = async () => {
    setBusy('apply'); setError('')
    try { await api.setLevel(level); await onChanged(); loadRuns() } catch { setError('Could not apply that level.') }
    setBusy('')
  }
  const retrain = async () => {
    setBusy('retrain'); setError(''); setSure(false)
    try { setResult(await api.retrain()); await onChanged(); loadRuns() } catch { setError('Retraining failed. Check the model service.') }
    setBusy('')
  }

  if (!meta) return <div className="empty">Loading model…</div>
  const ev = meta.evaluation
  const missed = preview ? preview.failures.filter((f) => f.lead_hours === null) : []

  return (
    <div className="model">
      {error && <div className="banner" role="alert">{error}</div>}

      <section className="card">
        <h2>Model in use</h2>
        <p className="sub">Distance-from-normal model across 51 sensors. Everything below is measured on the same recorded history the model learned from, so it flatters the model.</p>
        <div className="stats">
          <div><div className="label">Alarm level</div><div className="big">{fmtLevel(meta.level)}</div><div className="note">{meta.level === 1 ? 'default' : 'changed from the default of 1×'}</div></div>
          <div><div className="label">Failures caught early</div><div className="big">{ev.failures_detected} of {ev.failures_total}</div><div className="note">{ev.lead_min !== null ? `${ev.lead_min}–${ev.lead_max} h ahead` : 'none caught'}</div></div>
          <div><div className="label">False alert episodes</div><div className="big">{ev.healthy_false_alarm_episodes}</div><div className="note">over four months of healthy running</div></div>
          <div><div className="label">Trained on</div><div className="big">{meta.train.train_rows.toLocaleString()}</div><div className="note">healthy readings</div></div>
        </div>
      </section>

      <section className="card">
        <h2>Sensitivity</h2>
        <p className="sub">Move the slider to replay the recorded history at a different alarm level. Lower is more sensitive: more failures caught, more false alerts.</p>
        <div className="slider-row">
          <label htmlFor="level">Alarm level</label>
          <input id="level" type="range" min={MIN} max={MAX} step={STEP} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
          <output htmlFor="level"><b>{fmtLevel(level)}</b></output>
          {isAdmin && <button className="btn primary" disabled={busy !== '' || Math.abs(level - current) < 1e-9} onClick={apply}>{busy === 'apply' ? 'Applying…' : 'Apply'}</button>}
        </div>
        {preview && (
          <div className="preview" aria-live="polite">
            <div className="tradeoff">
              <div><span className="big">{preview.failures_detected} of {preview.failures_total}</span> failures caught{preview.lead_min !== null && <span className="note"> · {preview.lead_min}–{preview.lead_max} h ahead</span>}</div>
              <div><span className="big">{preview.healthy_false_alarm_episodes}</span> false alert episodes<span className="note"> · over four months</span></div>
            </div>
            <p className="missed">
              {missed.length === 0 ? 'No recorded failure is missed at this level.' : `Missed at this level: ${missed.map((m) => shortDate(parseT(m.failure))).join(', ')}.`}
            </p>
            <div className="table-wrap"><table>
              <thead><tr><th>Failure</th><th className="num">Warned ahead</th></tr></thead>
              <tbody>{preview.failures.map((f) => (
                <tr key={f.failure}><td>{shortDate(parseT(f.failure))}</td>
                  <td className="num">{f.lead_hours === null ? <span className="miss">Missed</span> : `${f.lead_hours} h`}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        )}
        {!isAdmin && <p className="hint">Only admins can apply a new level. Anyone can preview it.</p>}

        {curve.length > 0 && (
          <>
            <h3 className="subhead">Trade-off at a glance</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>Alarm level</th><th className="num">Failures caught</th><th className="num">False alert episodes</th><th /></tr></thead>
              <tbody>{curve.map((r) => (
                <tr key={r.level} className={r.level === meta.level ? 'now' : ''}>
                  <td>{fmtLevel(r.level)}{r.level === meta.level && <span className="pill" style={{ marginLeft: 8 }}>in use</span>}</td>
                  <td className="num">{r.failures_detected} of {r.failures_total}</td>
                  <td className="num">{r.false_alarm_episodes}</td>
                  <td><button className="linkish" onClick={() => setLevel(r.level)}>Try</button></td>
                </tr>
              ))}</tbody>
            </table></div>
            <p className="hint">Counts of false alerts can rise slightly at a higher level when one long alert splits into two shorter ones.</p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Retrain</h2>
        <p className="sub">
          Refits the model on healthy data, adjusted by what operators have decided: alerts marked false alarm are treated as healthy,
          alerts marked real issue are kept out of the healthy data. Right now that is {falseN} false alarm{falseN === 1 ? '' : 's'} and {realN} real issue{realN === 1 ? '' : 's'}.
          With few labels the result barely moves, and the alarm level above is the bigger lever.
        </p>
        {isAdmin ? (
          sure ? (
            <div className="confirm" role="alertdialog" aria-label="Confirm retrain">
              <span>This takes about ten seconds and replaces the current model. Continue?</span>
              <button className="btn primary" onClick={retrain}>Retrain now</button>
              <button className="btn" onClick={() => setSure(false)}>Cancel</button>
            </div>
          ) : <button className="btn" disabled={busy !== ''} onClick={() => setSure(true)}>{busy === 'retrain' ? 'Retraining…' : 'Retrain model'}</button>
        ) : <p className="hint">Only admins can retrain.</p>}
        {result && (
          <p className="result" role="status">
            Retrained: {result.before.failures_detected} → <b>{result.meta.evaluation.failures_detected}</b> of {result.meta.evaluation.failures_total} failures caught,
            {' '}{result.before.healthy_false_alarm_episodes} → <b>{result.meta.evaluation.healthy_false_alarm_episodes}</b> false alert episodes
            {' '}(measured on the training history).
          </p>
        )}
      </section>

      <section className="card">
        <h2>Run history</h2>
        <p className="sub">Every time the service starts, the alarm level changes or the model is retrained.</p>
        {runs.length === 0 ? <div className="empty">No runs recorded yet.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Event</th><th className="num">Level</th><th className="num">Caught</th><th className="num">False episodes</th><th>By</th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id}>
                <td>{runTime(r.recordedAt)}</td>
                <td>{TRIGGER[r.trigger]}{r.trigger === 'retrain' && <div className="hint">{r.windowsIncluded ?? 0} false alarm and {r.windowsExcluded ?? 0} real issue windows used</div>}</td>
                <td className="num">{fmtLevel(r.level)}</td>
                <td className="num">{r.failuresDetected} of {r.failuresTotal}</td>
                <td className="num">{r.healthyFalseAlarmEpisodes}</td>
                <td>{r.by ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  )
}
