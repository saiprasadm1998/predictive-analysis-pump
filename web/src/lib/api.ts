import type { Alert, Meta, Reading, ReplayState, Scenario, ScorePoint, Series } from './types'

let token: string | null = null
try { token = localStorage.getItem('pg_token') } catch { /* storage unavailable */ }

export const hasToken = () => token !== null
export function clearToken() {
  token = null
  try { localStorage.removeItem('pg_token') } catch { /* ignore */ }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })
  if (res.status === 401) { clearToken(); throw new Error('unauthorised') }
  if (!res.ok) throw new Error(`${path} failed (${res.status})`)
  return (await res.json()) as T
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('Wrong username or password')
  token = ((await res.json()) as { token: string }).token
  try { localStorage.setItem('pg_token', token) } catch { /* ignore */ }
}

const post = (body: object) => call<ReplayState>('/api/replay', { method: 'POST', body: JSON.stringify(body) })

export const api = {
  state: () => call<ReplayState>('/api/state'),
  meta: () => call<Meta>('/api/meta'),
  scenarios: () => call<Scenario[]>('/api/scenarios'),
  alerts: () => call<Alert[]>('/api/alerts'),
  ack: (id: number) => call<Alert>(`/api/alerts/${id}/ack`, { method: 'POST' }),
  play: () => post({ action: 'play' }),
  pause: () => post({ action: 'pause' }),
  speed: (speed: number) => post({ action: 'speed', speed }),
  seek: (t: string) => post({ action: 'seek', t }),
  scores: (start: string, end: string, step: number) =>
    call<ScorePoint[]>(`/api/scores?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&step=${step}`),
  readings: (start: string, end: string, sensors: string[], step: number) =>
    call<Series>(`/api/readings?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&sensors=${sensors.join(',')}&step=${step}`),
}

export type LiveMessage =
  | { type: 'reading'; data: Reading }
  | { type: 'alert'; data: Alert }
  | { type: 'state'; data: ReplayState }

export function connectLive(onMessage: (m: LiveMessage) => void, onClose: () => void): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${token ?? ''}`)
  ws.onmessage = (e) => onMessage(JSON.parse(e.data) as LiveMessage)
  ws.onclose = onClose
  return () => { ws.onclose = null; ws.close() }
}
