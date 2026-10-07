export type PumpState = "healthy" | "watch" | "warning" | "critical";

export interface TopSensor { sensor: string; share: number }

export interface Reading {
  t: string;
  health: number;
  ratio: number;
  state: PumpState;
  label: string;
  top_sensors: TopSensor[];
  run_above: number;   // consecutive minutes above the alarm threshold
  run_below: number;   // consecutive minutes below 0.8x threshold
}

export interface Alert {
  id: number;
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
}
