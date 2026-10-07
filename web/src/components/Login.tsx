import { useState } from 'react'
import { login } from '../lib/api'

export default function Login({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState('operator')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await login(user, pass); onDone() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="login card">
      <h1 style={{ margin: 0, fontSize: 20 }}>Pump Guardian</h1>
      <p className="sub" style={{ margin: '4px 0 0' }}>Predictive maintenance for oil &amp; gas pumps</p>
      <form onSubmit={submit}>
        <label>Username<input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" autoFocus /></label>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy || !pass}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="hint">Demo build: the default login is set by DEMO_USER / DEMO_PASS on the API.</p>
      </form>
    </div>
  )
}
