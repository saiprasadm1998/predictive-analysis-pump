import type { Alert, WorkOrder } from "./types.js";

export interface ScorePoint { t: string; health: number; ratio: number }

export interface ShiftReport {
  from: string;
  to: string;
  hours: number;
  generatedAt: string;
  health: { average: number | null; lowest: { value: number; t: string } | null; latest: number | null };
  timeInState: { healthy: number; watch: number; warning: number; critical: number };  // percent of the window
  counts: { active: number; opened: number; closed: number; stillOpen: number; critical: number;
            realIssue: number; falseAlarm: number; awaitingReview: number };
  alerts: Alert[];
  workOrders: WorkOrder[];       // raised against these alerts, plus anything still open
  openWorkOrders: number;
  narrative: string[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (t: string) => `${Number(t.slice(8, 10))} ${MONTHS[Number(t.slice(5, 7)) - 1]}, ${t.slice(11, 16)}`;
const pad = (n: number) => String(n).padStart(2, "0");
export const fmtT = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
export const parseT = (t: string) => Date.parse(t.replace(" ", "T") + "Z");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pct = (n: number) => Math.round(n * 10) / 10;

const stateOf = (ratio: number) => (ratio > 2 ? "critical" : ratio > 1 ? "warning" : ratio > 0.7 ? "watch" : "healthy") as keyof ShiftReport["timeInState"];

/**
 * Summarise a stretch of the recorded history. `to` is the replay clock, since this pump is replayed from recorded
 * data. Time in each state is approximate: it is counted from downsampled points, each standing for one step.
 */
export function buildReport(to: string, hours: number, points: ScorePoint[], alerts: Alert[], orders: WorkOrder[], generatedAt = new Date().toISOString()): ShiftReport {
  const toMs = parseT(to), fromMs = toMs - hours * 3600e3;
  const from = fmtT(fromMs);

  const tally = { healthy: 0, watch: 0, warning: 0, critical: 0 };
  for (const p of points) tally[stateOf(p.ratio)]++;
  const n = points.length;
  const timeInState = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, n ? pct((v / n) * 100) : 0])) as ShiftReport["timeInState"];
  const lowest = points.reduce<ShiftReport["health"]["lowest"]>((m, p) => (!m || p.health < m.value ? { value: p.health, t: p.t } : m), null);
  const health = {
    average: n ? Math.round((points.reduce((s, p) => s + p.health, 0) / n) * 10) / 10 : null,
    lowest, latest: n ? points[n - 1].health : null,
  };

  const overlapping = alerts
    .filter((a) => parseT(a.start) <= toMs && (a.end === null || parseT(a.end) >= fromMs))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const opened = overlapping.filter((a) => parseT(a.start) >= fromMs);
  const closed = overlapping.filter((a) => a.end !== null && parseT(a.end) <= toMs && a.status === "closed");
  const counts = {
    active: overlapping.length, opened: opened.length, closed: closed.length,
    stillOpen: overlapping.filter((a) => a.status === "open").length,
    critical: overlapping.filter((a) => a.severity === "critical").length,
    realIssue: overlapping.filter((a) => a.label === "real_issue").length,
    falseAlarm: overlapping.filter((a) => a.label === "false_alarm").length,
    awaitingReview: overlapping.filter((a) => a.label === null && a.workflow === "new").length,
  };

  const ids = new Set(overlapping.map((a) => a.id));
  const wos = orders.filter((o) => (o.alertId && ids.has(o.alertId)) || o.status !== "done");
  const openWorkOrders = wos.filter((o) => o.status !== "done").length;

  const narrative: string[] = [];
  if (n === 0) {
    narrative.push(`There is no recorded data between ${nice(from)} and ${nice(to)}.`);
  } else {
    narrative.push(
      `From ${nice(from)} to ${nice(to)} the pump was healthy ${timeInState.healthy}% of the time, on watch ${timeInState.watch}%, ` +
      `in warning ${timeInState.warning}% and critical ${timeInState.critical}%. ` +
      (lowest ? `Health was lowest at ${lowest.value} (${nice(lowest.t)}).` : ""));
  }
  if (counts.active === 0) {
    narrative.push("No alerts were active in this period.");
  } else {
    narrative.push(
      `${plural(counts.active, "alert")} ${counts.active === 1 ? "was" : "were"} active: ${counts.opened} opened in the period, ${counts.closed} closed, ` +
      `${counts.stillOpen} still open${counts.critical ? `, ${counts.critical} reaching critical` : ""}.`);
    const verdicts: string[] = [];
    if (counts.realIssue) verdicts.push(`${counts.realIssue} real ${counts.realIssue === 1 ? "issue" : "issues"}`);
    if (counts.falseAlarm) verdicts.push(`${counts.falseAlarm} false ${counts.falseAlarm === 1 ? "alarm" : "alarms"}`);
    if (counts.awaitingReview) verdicts.push(`${counts.awaitingReview} not yet reviewed`);
    if (verdicts.length) narrative.push(`Operator verdicts: ${verdicts.join(", ")}.`);
  }
  narrative.push(openWorkOrders === 0 ? "There are no open work orders." : `${plural(openWorkOrders, "work order")} ${openWorkOrders === 1 ? "is" : "are"} still open.`);

  return { from, to, hours, generatedAt, health, timeInState, counts, alerts: overlapping, workOrders: wos, openWorkOrders, narrative };
}

/** Quote a CSV cell. Cells that start with a formula character are prefixed so spreadsheets treat them as text. */
export function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const alertsCsv = (alerts: Alert[]) => toCsv(
  ["id", "opened", "closed", "severity", "peak_x_alarm_level", "status", "workflow", "verdict", "driving_sensors", "failure_followed_hours", "comments"],
  alerts.map((a) => [a.id, a.start, a.end ?? "", a.severity, a.peakRatio.toFixed(2), a.status, a.workflow, a.label ?? "",
    a.topSensors.slice(0, 3).map((s) => `${s.sensor} ${Math.round(s.share * 100)}%`).join("; "), a.failureAfterHours ?? "",
    a.comments.map((c) => `${c.by}: ${c.text}`).join(" | ")]));

export const workOrdersCsv = (orders: WorkOrder[]) => toCsv(
  ["id", "alert_id", "title", "description", "priority", "status", "assignee", "created_by", "created_at", "completed_at", "outcome"],
  orders.map((o) => [o.id, o.alertId ?? "", o.title, o.description, o.priority, o.status, o.assignee ?? "", o.createdBy, o.createdAt, o.completedAt ?? "", o.outcome ?? ""]));
