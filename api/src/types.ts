export type PumpState = "healthy" | "watch" | "warning" | "critical";

export interface TopSensor { sensor: string; share: number }

export interface Match {
  failure: string;
  similarity: number;
  level: "strong" | "possible" | "weak";
  fingerprint: { sensor: string; z: number }[];
  known_failures: number;
}

export interface Reading {
  t: string;
  health: number;
  ratio: number;
  state: PumpState;
  label: string;
  top_sensors: TopSensor[];
  run_above: number;   // consecutive minutes above the alarm threshold
  run_below: number;   // consecutive minutes below 0.8x threshold
  match: Match | null; // closest already-recorded failure, only while above the alarm level
}

export type Role = "viewer" | "operator" | "admin";

export interface User {
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

export interface ModelRun {
  id: string;
  recordedAt: string;
  threshold: number;
  failuresDetected: number;
  failuresTotal: number;
  healthyAlarmRate: number;
  healthyFalseAlarmEpisodes: number;
  trigger: "startup" | "sensitivity" | "retrain";
  level: number;               // alarm level in force, as a multiple of the model's threshold
  by?: string;
  windowsIncluded?: number;    // retrain: false-alarm windows added to the healthy data
  windowsExcluded?: number;    // retrain: real-issue windows removed from it
}

export type Workflow = "new" | "investigating" | "resolved";
export type Label = "real_issue" | "false_alarm";

export interface Comment { id: string; by: string; at: string; text: string }

export interface Alert {
  id: string;           // deterministic from the start time, so replays never duplicate alerts
  start: string;
  end: string | null;
  peakRatio: number;
  severity: "warning" | "critical";
  status: "open" | "closed";
  acknowledged: boolean;
  topSensors: TopSensor[];
  summary: string;
  failureAfterHours: number | null;
  recovery: boolean;   // opened within 48h after a recorded failure (pump restarting)
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  match?: Match | null;  // closest recorded failure at the alert's peak
  workflow: Workflow;    // operator-driven; independent of open/closed (which the model decides)
  label: Label | null;   // operator verdict, used for tuning feedback
  labelledBy?: string;
  comments: Comment[];
}

export type Priority = "low" | "medium" | "high";
export type WorkStatus = "open" | "in_progress" | "done";

export interface WorkOrder {
  id: string;               // WO-0001, WO-0002, ...
  alertId: string | null;   // the alert it came from, if any
  title: string;
  description: string;
  priority: Priority;
  status: WorkStatus;
  assignee: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  outcome?: string;         // what was found and done; required to close, and reused as history in suggestions
}

export interface Suggestion {
  id: string;
  text: string;
  reason: string;
  /** Pre-filled work order title when the operator turns this suggestion into one. */
  title: string;
  priority: Priority;
}
