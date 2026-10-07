import { useState } from 'react'
import type { Alert, Feedback, Label, Workflow } from '../lib/types'
import { parseT, shortDateTime } from '../lib/time'

export const WORKFLOW_TEXT: Record<Workflow, string> = { new: 'New', investigating: 'Investigating', resolved: 'Resolved' }

export interface WorkflowActions {
  setWorkflow: (id: string, w: Workflow) => void
  setLabel: (id: string, l: Label | null) => void
  comment: (id: string, text: string) => void
}

/** Status, verdict and notes for one alert. Viewers see them read-only. */
export function AlertWorkflow({ a, actions, canAct }: { a: Alert; actions: WorkflowActions; canAct: boolean }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const submit = () => {
    const t = text.trim()
    if (!t) return
    actions.comment(a.id, t)
    setText('')
  }
  return (
    <div className="wf">
      {canAct ? (
        <select aria-label="Alert status" value={a.workflow} onChange={(e) => actions.setWorkflow(a.id, e.target.value as Workflow)}>
          {(Object.keys(WORKFLOW_TEXT) as Workflow[]).map((w) => <option key={w} value={w}>{WORKFLOW_TEXT[w]}</option>)}
        </select>
      ) : <span className={`pill wf-${a.workflow}`}>{WORKFLOW_TEXT[a.workflow]}</span>}

      <div className="verdict" role="group" aria-label="Verdict">
        {canAct ? (
          <>
            <button className={`btn small${a.label === 'real_issue' ? ' on' : ''}`} aria-pressed={a.label === 'real_issue'}
              onClick={() => actions.setLabel(a.id, a.label === 'real_issue' ? null : 'real_issue')}>Real issue</button>
            <button className={`btn small${a.label === 'false_alarm' ? ' on' : ''}`} aria-pressed={a.label === 'false_alarm'}
              onClick={() => actions.setLabel(a.id, a.label === 'false_alarm' ? null : 'false_alarm')}>False alarm</button>
          </>
        ) : a.label ? <span className="pill">{a.label === 'real_issue' ? 'Real issue' : 'False alarm'}</span> : null}
      </div>
      {a.label && a.labelledBy && <div className="hint">marked by {a.labelledBy}</div>}

      <button className="linkish" aria-expanded={open} onClick={() => setOpen(!open)}>
        {a.comments.length ? `Notes (${a.comments.length})` : canAct ? 'Add note' : 'No notes'}
      </button>
      {open && (
        <div className="notes">
          {a.comments.map((c) => (
            <p key={c.id}><b>{c.by}</b> <span className="hint">{shortDateTime(parseT(c.at.slice(0, 19).replace('T', ' ')))}</span><br />{c.text}</p>
          ))}
          {canAct && (
            <form onSubmit={(e) => { e.preventDefault(); submit() }}>
              <input aria-label="Note" value={text} maxLength={1000} placeholder="What did you find?" onChange={(e) => setText(e.target.value)} />
              <button className="btn small" type="submit" disabled={!text.trim()}>Post</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

export function FeedbackNote({ f }: { f: Feedback | null }) {
  if (!f) return null
  return (
    <div className="feedback">
      <b>Operator feedback</b>
      <span className="hint"> {f.real} real, {f.falseAlarms} false alarm, {f.unlabelled} unlabelled</span>
      <p>{f.note}</p>
    </div>
  )
}
