export type PumpState = 'healthy' | 'watch' | 'warning' | 'critical'

export interface TopSensor { sensor: string; share: number }

export interface Match {
  failure: string
  similarity: number
  level: 'strong' | 'possible' | 'weak'
  fingerprint: { sensor: string; z: number }[]
  known_failures: number
}

export interface FailureCatalog {
  thresholds: { possible: number; strong: number }
  failures: {
    failure: string
    lead_hours: number | null
    fingerprint: { sensor: string; z: number }[]
    most_similar: { failure: string; similarity: number } | null
  }[]
}

export interface Reading {
  t: string
  health: number
  ratio: number
  state: PumpState
  label: string
  top_sensors: TopSensor[]
  run_above: number
  run_below: number
  match: Match | null
}

export interface Me { username: string; role: 'viewer' | 'operator' | 'admin' }

export type Workflow = 'new' | 'investigating' | 'resolved'
export type Label = 'real_issue' | 'false_alarm'
export interface AlertComment { id: string; by: string; at: string; text: string }

export interface Feedback {
  real: number
  falseAlarms: number
  unlabelled: number
  suggestion: null | { level: number; silenced: number; falseAlarms: number; lost: number; real: number }
  note: string
}

export interface Alert {
  id: string
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
  acknowledgedBy?: string
  acknowledgedAt?: string
  match?: Match | null
  workflow: Workflow
  label: Label | null
  labelledBy?: string
  comments: AlertComment[]
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
  level: number
  train: { train_rows: number; trained_from: string; trained_to: string; windows_included: number; windows_excluded: number }
  evaluation: {
    failures_detected: number
    failures_total: number
    healthy_alarm_rate: number
    healthy_false_alarm_episodes: number
    lead_min: number | null
    lead_max: number | null
    failures: { failure: string; lead_hours: number | null }[]
  }
}

export interface ScorePoint { t: string; health: number; ratio: number; status: string }
export interface Series { t: string[]; [sensor: string]: (string | number)[] }

export interface Preview {
  level: number
  failures_total: number
  failures_detected: number
  healthy_false_alarm_episodes: number
  lead_min: number | null
  lead_max: number | null
  failures: { failure: string; lead_hours: number | null }[]
}
export interface CurveRow { level: number; failures_detected: number; failures_total: number; false_alarm_episodes: number }
export interface ModelRun {
  id: string
  recordedAt: string
  threshold: number
  level: number
  trigger: 'startup' | 'sensitivity' | 'retrain'
  failuresDetected: number
  failuresTotal: number
  healthyFalseAlarmEpisodes: number
  by?: string
  windowsIncluded?: number
  windowsExcluded?: number
}
export interface RetrainResult {
  before: { threshold: number; failures_detected: number; failures_total: number; healthy_false_alarm_episodes: number }
  meta: Meta
}

export type Priority = 'low' | 'medium' | 'high'
export type WorkStatus = 'open' | 'in_progress' | 'done'
export interface WorkOrder {
  id: string
  alertId: string | null
  title: string
  description: string
  priority: Priority
  status: WorkStatus
  assignee: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  outcome?: string
}
export interface Suggestion { id: string; text: string; reason: string; title: string; priority: Priority }
export interface NewWorkOrder { alertId?: string | null; title: string; description?: string; priority: Priority; assignee?: string | null }
export interface WorkOrderPatch { status?: WorkStatus; assignee?: string | null; priority?: Priority; outcome?: string }
