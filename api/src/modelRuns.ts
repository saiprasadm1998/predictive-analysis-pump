import type { Meta } from "./ml.js";
import type { Alert, ModelRun } from "./types.js";

/** Snapshot of how the model is performing right now, for the run history. */
export function runFrom(meta: Meta, trigger: ModelRun["trigger"], extra: Partial<ModelRun> = {}): ModelRun {
  const ev = meta.evaluation;
  const stamp = trigger === "startup" ? "" : `-${Date.now()}`;
  return {
    id: `${trigger}-thr${meta.threshold.toFixed(3)}-l${meta.level}-d${ev.failures_detected}-e${ev.healthy_false_alarm_episodes}${stamp}`,
    recordedAt: new Date().toISOString(), threshold: meta.threshold, level: meta.level, trigger,
    failuresDetected: ev.failures_detected, failuresTotal: ev.failures_total,
    healthyAlarmRate: ev.healthy_alarm_rate, healthyFalseAlarmEpisodes: ev.healthy_false_alarm_episodes,
    ...extra,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const OPEN_ALERT_HOURS = 6;

/** Training windows implied by operator verdicts: false alarms are healthy, real issues are not. */
export function verdictWindows(alerts: Alert[]): { include: [string, string][]; exclude: [string, string][] } {
  const win = (a: Alert): [string, string] => {
    const end = a.end ?? fmt(new Date(Date.parse(a.start.replace(" ", "T") + "Z") + OPEN_ALERT_HOURS * 3600e3));
    return [a.start, end];
  };
  return {
    include: alerts.filter((a) => a.label === "false_alarm").map(win),
    exclude: alerts.filter((a) => a.label === "real_issue").map(win),
  };
}
