import { useCallback, useEffect, useState } from 'react'
import { api, download } from '../lib/api'
import type { Me, NotifyStatus, ShiftReport } from '../lib/types'
import { parseT, shortDateTime } from '../lib/time'
import { STATUS_TEXT } from './Maintenance'

const HOURS = [4, 8, 12, 24, 72]
const stamp = (iso: string) => shortDateTime(parseT(iso.slice(0, 19).replace('T', ' ')))
const dataT = (t: string) => shortDateTime(parseT(t))

export default function ReportsPage({ me, replayT }: { me: Me | null; replayT: string }) {
  const [hours, setHours] = useState(8)
  const [report, setReport] = useState<ShiftReport | null>(null)
  const [notify, setNotify] = useState<NotifyStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isAdmin = me?.role === 'admin'

  // refreshes when the window changes or the replay clock moves on by at least a few minutes
  const load = useCallback(() => {
    api.shiftReport(hours).then((r) => { setReport(r); setError('') }).catch(() => setError('Could not build the report.'))
  }, [hours])
  useEffect(load, [load, replayT.slice(0, 15)])
  useEffect(() => { api.notifications().then(setNotify).catch(() => { /* optional */ }) }, [])

  const save = (path: string, name: string) => download(path, name).catch(() => setError('Download failed.'))
  const test = async () => {
    setBusy(true)
    try { setNotify(await api.testNotification()); setError('') } catch { setError('The test message could not be sent. Check SLACK_WEBHOOK_URL.'); api.notifications().then(setNotify).catch(() => {}) }
    setBusy(false)
  }

  return (
    <div className="model report">
      {error && <div className="banner" role="alert">{error}</div>}

      <section className="card report-body">
        <div className="head">
          <div>
            <h2>Shift report</h2>
            <p className="sub">{report ? `${dataT(report.from)} to ${dataT(report.to)} (recorded time, ${report.hours} hours)` : 'Loading…'}</p>
          </div>
          <div className="report-tools no-print">
            <label>Period
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {HOURS.map((h) => <option key={h} value={h}>Last {h} hours</option>)}
              </select>
            </label>
            <button className="btn" onClick={load}>Refresh</button>
            <button className="btn primary" disabled={!report} onClick={() => window.print()}>Print or save as PDF</button>
          </div>
        </div>

        {report && (
          <>
            <div className="narrative">{report.narrative.map((p, i) => <p key={i}>{p}</p>)}</div>

            <div className="stats">
              <div><div className="label">Average health</div><div className="big">{report.health.average ?? '—'}</div><div className="note">lowest {report.health.lowest?.value ?? '—'}</div></div>
              <div><div className="label">Alerts active</div><div className="big">{report.counts.active}</div><div className="note">{report.counts.stillOpen} still open</div></div>
              <div><div className="label">Real issues</div><div className="big">{report.counts.realIssue}</div><div className="note">{report.counts.falseAlarm} false alarms</div></div>
              <div><div className="label">Open work orders</div><div className="big">{report.openWorkOrders}</div><div className="note">raised or still open</div></div>
            </div>

            <h3 className="subhead">Time in each state</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>Healthy</th><th>Watch</th><th>Warning</th><th>Critical</th></tr></thead>
              <tbody><tr>
                <td>{report.timeInState.healthy}%</td><td>{report.timeInState.watch}%</td>
                <td>{report.timeInState.warning}%</td><td>{report.timeInState.critical}%</td>
              </tr></tbody>
            </table></div>
            <p className="hint">Approximate: counted from sampled readings, not every minute.</p>

            <h3 className="subhead">Alerts</h3>
            {report.alerts.length === 0 ? <div className="empty">No alerts in this period.</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Opened</th><th>Severity</th><th className="num">Peak</th><th>Main sensors</th><th>Status</th><th>Verdict</th></tr></thead>
                <tbody>{report.alerts.map((a) => (
                  <tr key={a.id}>
                    <td>{dataT(a.start)}<div className="hint">{a.end ? `closed ${dataT(a.end)}` : 'still open'}</div></td>
                    <td>{a.severity === 'critical' ? 'Critical' : 'Warning'}</td>
                    <td className="num">{a.peakRatio.toFixed(1)}×</td>
                    <td>{a.topSensors.slice(0, 3).map((s) => s.sensor.replace('sensor_', 'Sensor ')).join(', ')}</td>
                    <td>{a.workflow === 'new' ? 'New' : a.workflow === 'investigating' ? 'Investigating' : 'Resolved'}</td>
                    <td>{a.label === 'real_issue' ? 'Real issue' : a.label === 'false_alarm' ? 'False alarm' : 'Not reviewed'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}

            <h3 className="subhead">Work orders</h3>
            {report.workOrders.length === 0 ? <div className="empty">No work orders for this period.</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Order</th><th>Work</th><th>Priority</th><th>Status</th></tr></thead>
                <tbody>{report.workOrders.map((w) => (
                  <tr key={w.id}>
                    <td><b>{w.id}</b></td>
                    <td>{w.title}{w.outcome && <div className="outcome"><b>Found and done:</b> {w.outcome}</div>}</td>
                    <td>{w.priority[0].toUpperCase() + w.priority.slice(1)}</td>
                    <td>{STATUS_TEXT[w.status]}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <p className="hint">Prepared {stamp(report.generatedAt)}. Times are from the recorded sensor history being replayed.</p>
          </>
        )}
      </section>

      <section className="card no-print">
        <h2>Downloads</h2>
        <p className="sub">Spreadsheet files of everything raised so far in this replay.</p>
        <div className="report-tools">
          <button className="btn" onClick={() => save('/api/reports/alerts.csv', 'alerts.csv')}>Alerts (CSV)</button>
          <button className="btn" onClick={() => save('/api/reports/work-orders.csv', 'work-orders.csv')}>Work orders (CSV)</button>
        </div>
      </section>

      <section className="card no-print">
        <h2>Slack notifications</h2>
        {notify === null ? <p className="sub">Loading…</p> : notify.enabled ? (
          <>
            <p className="sub">On. A message is posted when an alert opens{notify.minSeverity === 'warning' ? ' and again if it becomes critical' : ' at critical severity'}. Alerts while the pump restarts after a failure are not announced.</p>
            <p>{notify.sent} sent{notify.dropped ? `, ${notify.dropped} held back by the rate limit` : ''}.{notify.lastSentAt && ` Last at ${stamp(notify.lastSentAt)}.`}</p>
            {notify.lastError && <p className="miss" role="status">Last attempt failed: {notify.lastError}</p>}
            {isAdmin ? <button className="btn" disabled={busy} onClick={test}>{busy ? 'Sending…' : 'Send a test message'}</button> : <p className="hint">Only admins can send a test message.</p>}
          </>
        ) : (
          <p className="sub">Off. Set <code>SLACK_WEBHOOK_URL</code> in <code>api/.env</code> to a Slack incoming-webhook URL and restart the API.</p>
        )}
      </section>
    </div>
  )
}
