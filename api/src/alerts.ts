import type { Alert, Reading } from "./types.js";
import { summarise } from "./summary.js";

export const OPEN_AFTER_MIN = 30;    // minutes above threshold before an alert opens
export const CLOSE_AFTER_MIN = 180;  // minutes below 0.8x threshold before it closes

export class AlertEngine {
  alerts: Alert[] = [];
  private nextId = 1;
  private current: Alert | null = null;
  private failures: number[] = [];

  setFailures(times: string[]) {
    this.failures = times.map((t) => Date.parse(t.replace(" ", "T") + "Z"));
  }

  /** Feed one reading; returns an alert if one was opened or changed this tick. */
  push(r: Reading): Alert | null {
    if (!this.current && r.run_above >= OPEN_AFTER_MIN) {
      const a: Alert = {
        id: this.nextId++, start: r.t, end: null, peakRatio: r.ratio,
        severity: r.ratio > 2 ? "critical" : "warning", status: "open", acknowledged: false,
        topSensors: r.top_sensors, summary: "", failureAfterHours: null,
      };
      a.summary = summarise(a.severity, a.peakRatio, a.topSensors, r.t);
      this.alerts.unshift(a);
      this.current = a;
      return a;
    }
    if (this.current) {
      const a = this.current;
      let changed = false;
      if (r.ratio > a.peakRatio) {
        a.peakRatio = r.ratio; a.topSensors = r.top_sensors;
        const sev = r.ratio > 2 ? "critical" : "warning";
        if (sev !== a.severity) a.severity = sev;
        a.summary = summarise(a.severity, a.peakRatio, a.topSensors, r.t);
        changed = true;
      }
      if (r.run_below >= CLOSE_AFTER_MIN) {
        a.status = "closed"; a.end = r.t;
        const start = Date.parse(a.start.replace(" ", "T") + "Z");
        const next = this.failures.find((f) => f >= start);
        a.failureAfterHours = next && next - start <= 72 * 3600e3 ? Math.round(((next - start) / 3600e3) * 10) / 10 : null;
        this.current = null;
        return a;
      }
      return changed ? a : null;
    }
    return null;
  }

  ack(id: number): Alert | undefined {
    const a = this.alerts.find((x) => x.id === id);
    if (a) a.acknowledged = true;
    return a;
  }

  reset() { this.alerts = []; this.current = null; this.nextId = 1; }
}
