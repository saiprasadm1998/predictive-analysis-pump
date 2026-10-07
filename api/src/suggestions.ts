import { readFileSync } from "node:fs";
import type { Alert, Priority, Suggestion, WorkOrder } from "./types.js";

export type SensorMap = Record<string, string>;

/** Optional mapping from the dataset's anonymous sensor ids to real components. Missing or invalid means no mapping. */
export function loadSensorMap(path: string): SensorMap {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^sensor_\d{2}$/.test(k) && typeof v === "string"));
  } catch { return {}; }
}

const name = (s: string) => s.replace("sensor_", "Sensor ");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (t: string) => `${Number(t.slice(8, 10))} ${MONTHS[Number(t.slice(5, 7)) - 1]}`;

/**
 * Suggested checks for an alert. These are generic condition-monitoring steps chosen from the alert's severity,
 * its closest recorded failure, its driving sensors, and what earlier work orders found. They are prompts for a
 * human to follow up, not diagnoses: the dataset's sensors are anonymous, so component advice only appears for
 * sensors listed in the sensor map.
 */
export interface PastWork { order: WorkOrder; alert: Alert }

export function suggest(alert: Alert, past: PastWork[], map: SensorMap = {}): Suggestion[] {
  if (alert.label === "false_alarm") return [];
  const out: Suggestion[] = [];
  const add = (id: string, text: string, reason: string, title: string, priority: Priority) => out.push({ id, text, reason, title, priority });

  if (alert.recovery) {
    add("restart", "Confirm the restart procedure was completed and the pump has settled.",
      "This alert opened within 48 hours of a recorded failure.", "Verify pump after restart", "medium");
  } else if (alert.severity === "critical") {
    add("critical", "Inspect the pump now and line up a standby or controlled shutdown if the trend continues.",
      `Peak was ${alert.peakRatio.toFixed(1)}x the alarm level, well past the critical line.`, "Urgent inspection: pump well outside normal", "high");
  } else {
    add("warning", "Schedule an inspection within the next shift and keep watching the trend.",
      `Readings stayed above the alarm level (peak ${alert.peakRatio.toFixed(1)}x).`, "Inspect pump: readings drifting from normal", "medium");
  }

  const m = alert.match;
  if (m && m.level !== "weak") {
    add("match", `Pull the maintenance record for the ${day(m.failure)} failure and check the same components first.`,
      `${m.level === "strong" ? "Strong" : "Possible"} match: ${Math.round(m.similarity * 100)}% alike.`,
      `Review ${day(m.failure)} failure record`, m.level === "strong" ? "high" : "medium");
  }

  for (const t of alert.topSensors.slice(0, 2)) {
    const comp = map[t.sensor];
    const pct = Math.round(t.share * 100);
    if (comp) add(`sensor-${t.sensor}`, `Inspect ${comp} (${name(t.sensor)}).`, `${name(t.sensor)} drives ${pct}% of the deviation.`, `Inspect ${comp}`, "medium");
    else add(`sensor-${t.sensor}`, `Check ${name(t.sensor)}: compare it with its last 72 hours and confirm the instrument is reading correctly.`,
      `${name(t.sensor)} drives ${pct}% of the deviation. Add it to the sensor map to name the component.`, `Check ${name(t.sensor)} and its instrument`, "low");
  }

  // what earlier completed work orders found when mostly the same sensors drove an alert
  const drivers = new Set(alert.topSensors.slice(0, 3).map((s) => s.sensor));
  const similar = past
    .filter((p) => p.order.status === "done" && p.order.outcome && p.alert.id !== alert.id
      && p.alert.topSensors.slice(0, 3).filter((s) => drivers.has(s.sensor)).length >= 2)
    .sort((a, b) => ((a.order.completedAt ?? "") < (b.order.completedAt ?? "") ? 1 : -1))
    .slice(0, 2);
  for (const p of similar) {
    add(`history-${p.order.id}`, `Last time these sensors led an alert (${p.order.id}, ${day(p.alert.start)}): ${p.order.outcome}`,
      "From a completed work order on an alert with similar driving sensors.", `Follow up on ${p.order.id} findings`, "medium");
  }
  return out;
}
