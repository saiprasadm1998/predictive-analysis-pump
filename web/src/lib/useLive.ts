import { useCallback, useEffect, useRef, useState } from 'react'
import { api, connectLive } from './api'
import type { NewWorkOrder, WorkOrder, WorkOrderPatch, Alert, FailureCatalog, Feedback, Label, Workflow, Me, Meta, Reading, ReplayState, Scenario, Series } from './types'
import { HOUR, fmtT, parseT } from './time'
import type { Pt } from '../components/LineChart'

const WINDOW_H = 72

export function useLive(onAuthLost: () => void) {
  const [replay, setReplay] = useState<ReplayState | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [health, setHealth] = useState<Pt[]>([])
  const [loadingWindow, setLoadingWindow] = useState(false)
  const [sensors, setSensors] = useState<Series | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [catalog, setCatalog] = useState<FailureCatalog | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [error, setError] = useState('')
  const lastX = useRef(0)
  const sensorKey = useRef('')
  const sensorAt = useRef(0)

  const fail = useCallback((e: unknown) => {
    const msg = (e as Error).message
    if (msg === 'unauthorised') onAuthLost()
    else setError(msg)
  }, [onAuthLost])

  const loadWindow = useCallback(async (t: string) => {
    setLoadingWindow(true)
    try {
      const end = parseT(t)
      const rows = await api.scores(fmtT(end - WINDOW_H * HOUR), t, 30)
      const pts = rows.map((r) => ({ x: parseT(r.t), y: r.health }))
      setHealth(pts)
      lastX.current = pts.length ? pts[pts.length - 1].x : end
    } catch (e) { fail(e) } finally { setLoadingWindow(false) }
  }, [fail])

  const loadSensors = useCallback(async (t: string, names: string[]) => {
    if (names.length === 0) return
    const end = parseT(t)
    try { setSensors(await api.readings(fmtT(end - WINDOW_H * HOUR), t, names, 30)) } catch (e) { fail(e) }
  }, [fail])

  // initial load
  useEffect(() => {
    let off: (() => void) | undefined
    let closed = false
    ;(async () => {
      try {
        const [s, m, sc, al, who, cat] = await Promise.all([api.state(), api.meta(), api.scenarios(), api.alerts(), api.me(), api.failures()])
        if (closed) return
        setMe(who); setCatalog(cat); setReplay(s); setMeta(m); setScenarios(sc); setAlerts(al)
        if (s.latest) setReading(s.latest)
        await loadWindow(s.t)
        off = connectLive((msg) => {
          if (msg.type === 'state') setReplay(msg.data)
          if (msg.type === 'alert') setAlerts((prev) => {
            const i = prev.findIndex((a) => a.id === msg.data.id)
            return i < 0 ? [msg.data, ...prev] : prev.map((a, k) => (k === i ? msg.data : a))
          })
          if (msg.type === 'reading') {
            const r = msg.data
            setReading(r)
            const x = parseT(r.t)
            if (x <= lastX.current || x - lastX.current > 12 * HOUR) {
              void loadWindow(r.t)                      // time jumped: rebuild the window
            } else {
              lastX.current = x
              setHealth((prev) => [...prev.filter((p) => p.x > x - WINDOW_H * HOUR), { x, y: r.health }])
            }
          }
        }, () => setError('Live connection lost. Reload to reconnect.'))
      } catch (e) { fail(e) }
    })()
    return () => { closed = true; off?.() }
  }, [loadWindow, fail])

  // sensor drill-down follows the sensors currently driving the anomaly
  const topNames = reading ? reading.top_sensors.slice(0, 3).map((s) => s.sensor) : []
  const key = topNames.join(',')
  useEffect(() => {
    if (!reading || !key) return
    const t = parseT(reading.t)
    if (key !== sensorKey.current || Math.abs(t - sensorAt.current) > 4 * HOUR) {
      sensorKey.current = key; sensorAt.current = t
      void loadSensors(reading.t, key.split(','))
    }
  }, [key, reading, loadSensors])

  // the tuning hint depends only on how alerts have been labelled
  const labelSig = alerts.map((a) => `${a.id}:${a.label ?? ''}`).join('|')
  useEffect(() => {
    if (!me) return
    api.feedback().then(setFeedback).catch(() => { /* hint is optional */ })
  }, [labelSig, me])

  /** After the model changes (new alarm level, retrain): refresh everything derived from it. */
  const reloadModel = useCallback(async () => {
    try {
      const [m, cat, sc, s] = await Promise.all([api.meta(), api.failures(), api.scenarios(), api.state()])
      setMeta(m); setCatalog(cat); setScenarios(sc); setReplay(s)
      if (s.latest) setReading(s.latest)
      await loadWindow(s.t)
    } catch (e) { fail(e) }
  }, [fail, loadWindow])

  useEffect(() => {
    if (!me) return
    api.workOrders().then(setWorkOrders).catch(() => { /* shown as empty */ })
  }, [me])

  const createWorkOrder = useCallback(async (b: NewWorkOrder) => {
    try { const w = await api.createWorkOrder(b); setWorkOrders((p) => [w, ...p]); return w } catch (e) { fail(e); return null }
  }, [fail])
  const updateWorkOrder = useCallback(async (id: string, b: WorkOrderPatch) => {
    try { const w = await api.updateWorkOrder(id, b); setWorkOrders((p) => p.map((x) => (x.id === w.id ? w : x))); return w } catch (e) { fail(e); return null }
  }, [fail])

  const patch = useCallback(async (fn: () => Promise<Alert>) => {
    try { const a = await fn(); setAlerts((p) => p.map((x) => (x.id === a.id ? a : x))) } catch (e) { fail(e) }
  }, [fail])

  const act = useCallback(async (fn: () => Promise<ReplayState>, reloadAlerts = false) => {
    try {
      setReplay(await fn())
      if (reloadAlerts) setAlerts(await api.alerts())
    } catch (e) { fail(e) }
  }, [fail])

  return {
    me, catalog, feedback, workOrders, replay, reading, alerts, meta, scenarios, health, loadingWindow, sensors, error,
    reloadModel, createWorkOrder, updateWorkOrder,
    play: () => act(api.play), pause: () => act(api.pause),
    setSpeed: (n: number) => act(() => api.speed(n)),
    seek: (t: string) => act(() => api.seek(t), true),
    jumpToScenario: async (s: Scenario) => {
      await act(() => api.seek(s.startAt), true)
      await act(() => api.play())
    },
    setWorkflow: (id: string, workflow: Workflow) => patch(() => api.workflow(id, { workflow })),
    setLabel: (id: string, label: Label | null) => patch(() => api.workflow(id, { label })),
    comment: (id: string, text: string) => patch(() => api.comment(id, text)),
    ack: async (id: string) => {
      try { const a = await api.ack(id); setAlerts((p) => p.map((x) => (x.id === a.id ? a : x))) } catch (e) { fail(e) }
    },
  }
}
