import { useState } from 'react'
import { api } from '../lib/api'
import type { Alert, NewWorkOrder, Priority, Suggestion, WorkOrder, WorkOrderPatch, WorkStatus } from '../lib/types'
import { parseT, shortDateTime } from '../lib/time'

export interface WorkActions {
  createWorkOrder: (b: NewWorkOrder) => Promise<WorkOrder | null>
  updateWorkOrder: (id: string, b: WorkOrderPatch) => Promise<WorkOrder | null>
}

export const STATUS_TEXT: Record<WorkStatus, string> = { open: 'Open', in_progress: 'In progress', done: 'Done' }
const PRIORITY_TEXT: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const when = (iso: string) => shortDateTime(parseT(iso.slice(0, 19).replace('T', ' ')))

function PriorityPill({ p }: { p: Priority }) {
  // text label as well as colour, so priority never depends on colour alone
  return <span className={`pill prio-${p}`}>{PRIORITY_TEXT[p]}</span>
}

/** Suggested checks for one alert, each of which can become a work order; plus the orders already raised for it. */
export function AlertActions({ a, orders, actions, canAct }: { a: Alert; orders: WorkOrder[]; actions: WorkActions; canAct: boolean }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Suggestion[] | null>(null)
  const [failed, setFailed] = useState(false)
  const linked = orders.filter((o) => o.alertId === a.id)
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && items === null) api.suggestions(a.id).then(setItems).catch(() => setFailed(true))
  }
  const make = (s: Suggestion) => actions.createWorkOrder({ alertId: a.id, title: s.title, description: `${s.text}\n(${s.reason})`, priority: s.priority })
  const already = (s: Suggestion) => linked.some((o) => o.title === s.title)

  return (
    <div className="actions">
      <button className="linkish" aria-expanded={open} onClick={toggle}>
        Suggested actions{linked.length ? ` · ${linked.length} work order${linked.length === 1 ? '' : 's'}` : ''}
      </button>
      {open && (
        <div className="suggest">
          {failed && <p className="hint">Could not load suggestions.</p>}
          {items?.length === 0 && <p className="hint">{a.label === 'false_alarm' ? 'Marked as a false alarm, so no action is suggested.' : 'Nothing to suggest.'}</p>}
          <ul>
            {items?.map((s) => (
              <li key={s.id}>
                <div>{s.text}</div>
                <div className="hint">{s.reason}</div>
                {canAct && (already(s)
                  ? <span className="pill">Work order raised</span>
                  : <button className="btn small" onClick={() => void make(s)}>Create work order</button>)}
              </li>
            ))}
          </ul>
          {linked.length > 0 && (
            <p className="hint">Raised: {linked.map((o) => `${o.id} (${STATUS_TEXT[o.status].toLowerCase()})`).join(', ')}</p>
          )}
          <p className="hint">Generic checks chosen from this alert, not a diagnosis.</p>
        </div>
      )}
    </div>
  )
}

function Row({ w, alerts, actions, canAct }: { w: WorkOrder; alerts: Alert[]; actions: WorkActions; canAct: boolean }) {
  const [closing, setClosing] = useState(false)
  const [outcome, setOutcome] = useState('')
  const alert = alerts.find((a) => a.id === w.alertId)
  const change = (s: WorkStatus) => {
    if (s === 'done') setClosing(true)
    else void actions.updateWorkOrder(w.id, { status: s })
  }
  const finish = async () => {
    const r = await actions.updateWorkOrder(w.id, { status: 'done', outcome: outcome.trim() })
    if (r) { setClosing(false); setOutcome('') }
  }
  return (
    <tr>
      <td><b>{w.id}</b><div className="hint">{when(w.createdAt)} · {w.createdBy}</div></td>
      <td>
        <div>{w.title}</div>
        {w.description && <div className="hint wo-desc">{w.description}</div>}
        {alert && <div className="hint">From the alert of {shortDateTime(parseT(alert.start))}</div>}
        {w.outcome && <div className="outcome"><b>Found and done:</b> {w.outcome}</div>}
      </td>
      <td><PriorityPill p={w.priority} /></td>
      <td>{w.assignee ?? <span className="hint">Unassigned</span>}</td>
      <td>
        {canAct ? (
          <select aria-label={`Status of ${w.id}`} value={w.status} onChange={(e) => change(e.target.value as WorkStatus)}>
            {(Object.keys(STATUS_TEXT) as WorkStatus[]).map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
          </select>
        ) : <span className="pill">{STATUS_TEXT[w.status]}</span>}
        {w.completedAt && <div className="hint">closed {when(w.completedAt)}</div>}
        {closing && (
          <form className="close" onSubmit={(e) => { e.preventDefault(); if (outcome.trim().length >= 3) void finish() }}>
            <input aria-label={`What was found and done for ${w.id}`} autoFocus value={outcome} maxLength={1000} placeholder="What was found and done?" onChange={(e) => setOutcome(e.target.value)} />
            <button className="btn small primary" type="submit" disabled={outcome.trim().length < 3}>Close</button>
            <button className="btn small" type="button" onClick={() => setClosing(false)}>Cancel</button>
          </form>
        )}
      </td>
    </tr>
  )
}

export default function MaintenancePage({ orders, alerts, actions, canAct }: { orders: WorkOrder[]; alerts: Alert[]; actions: WorkActions; canAct: boolean }) {
  const [filter, setFilter] = useState<'all' | WorkStatus>('all')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [assignee, setAssignee] = useState('')
  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter)
  const count = (s: WorkStatus) => orders.filter((o) => o.status === s).length

  const submit = async () => {
    if (title.trim().length < 3) return
    const w = await actions.createWorkOrder({ title: title.trim(), description: description.trim(), priority, assignee: assignee.trim() || null })
    if (w) { setTitle(''); setDescription(''); setAssignee(''); setPriority('medium') }
  }

  return (
    <div className="model">
      <section className="card">
        <h2>Work orders</h2>
        <p className="sub">A simple log of maintenance work. Closing one asks what was found and done, and that note is offered as a suggestion the next time the same sensors drive an alert.</p>
        <div className="tabs" role="tablist" aria-label="Filter work orders">
          {(['all', 'open', 'in_progress', 'done'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={`tab${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : STATUS_TEXT[f]} <span className="hint">{f === 'all' ? orders.length : count(f)}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? <div className="empty">{orders.length === 0 ? 'No work orders yet. Create one below, or from an alert’s suggested actions.' : 'Nothing in this view.'}</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Order</th><th>Work</th><th>Priority</th><th>Assigned to</th><th>Status</th></tr></thead>
            <tbody>{shown.map((w) => <Row key={w.id} w={w} alerts={alerts} actions={actions} canAct={canAct} />)}</tbody>
          </table></div>
        )}
      </section>

      {canAct && (
        <section className="card">
          <h2>New work order</h2>
          <form className="wo-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
            <label>Title<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replace seal on pump P-101" /></label>
            <label>Details<textarea value={description} maxLength={1000} rows={3} onChange={(e) => setDescription(e.target.value)} /></label>
            <div className="wo-row">
              <label>Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {(Object.keys(PRIORITY_TEXT) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_TEXT[p]}</option>)}
                </select>
              </label>
              <label>Assign to<input value={assignee} maxLength={64} onChange={(e) => setAssignee(e.target.value)} placeholder="optional" /></label>
              <button className="btn primary" type="submit" disabled={title.trim().length < 3}>Create</button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
