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
}

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
}
