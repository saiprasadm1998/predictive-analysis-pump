export type PumpState = 'healthy' | 'watch' | 'warning' | 'critical'

export interface TopSensor { sensor: string; share: number }

export interface Reading {
  t: string
  health: number
  ratio: number
  state: PumpState
  label: string
  top_sensors: TopSensor[]
  run_above: number
  run_below: number
}

export interface Alert {
  id: number
  start: string
  end: string | null
  peakRatio: number
  severity: 'warning' | 'critical'
  status: 'open' | 'closed'
  acknowledged: boolean
  topSensors: TopSensor[]
  summary: string
  failureAfterHours: number | null
  recovery: boolean
}

export interface ReplayState {
  playing: boolean
  speed: number
  t: string
  start: string
  end: string
  latest: Reading | null
}

export interface Scenario {
  id: number
  failure: string
  leadHours: number | null
  startAt: string
  topSensors: TopSensor[]
}

export interface Meta {
  sensors: string[]
  start: string
  end: string
  threshold: number
  evaluation: {
    failures_detected: number
    failures_total: number
    healthy_alarm_rate: number
    healthy_false_alarm_episodes: number
    failures: { failure: string; lead_hours: number | null }[]
  }
}

export interface ScorePoint { t: string; health: number; ratio: number; status: string }
export interface Series { t: string[]; [sensor: string]: (string | number)[] }
