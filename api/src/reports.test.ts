import { describe, expect, it } from "vitest";
import { alertsCsv, buildReport, cell, toCsv, workOrdersCsv, type ScorePoint } from "./reports.js";
import type { Alert, WorkOrder } from "./types.js";

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "a1", start: "2018-06-01 03:00:00", end: "2018-06-01 07:00:00", peakRatio: 1.4, severity: "warning", status: "closed", acknowledged: false,
  topSensors: [{ sensor: "sensor_04", share: 0.4 }], summary: "", failureAfterHours: null, recovery: false, workflow: "new", label: null, comments: [], ...over,
});
const order = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: "WO-0001", alertId: "a1", title: "Inspect", description: "", priority: "medium", status: "open", assignee: null, createdBy: "s",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
});
const pts = (ratios: number[]): ScorePoint[] => ratios.map((r, i) => ({ t: `2018-06-01 0${i}:00:00`, ratio: r, health: Math.round(100 / (1 + r * r)) }));

describe("buildReport", () => {
  it("tallies time in each state and finds the lowest health", () => {
    const r = buildReport("2018-06-01 08:00:00", 8, pts([0.2, 0.5, 0.8, 1.5, 2.5, 0.1, 0.1, 0.1]), [], []);
    expect(r.timeInState).toEqual({ healthy: 62.5, watch: 12.5, warning: 12.5, critical: 12.5 });
    expect(r.timeInState.healthy + r.timeInState.watch + r.timeInState.warning + r.timeInState.critical).toBeCloseTo(100, 0);
    expect(r.timeInState.critical).toBe(12.5);
    expect(r.health.lowest?.t).toBe("2018-06-01 04:00:00");
    expect(r.from).toBe("2018-06-01 00:00:00");
  });
  it("counts alerts that overlap the window, and what operators decided", () => {
    const inside = alert({ id: "in", label: "real_issue", workflow: "resolved" });
    const before = alert({ id: "old", start: "2018-05-01 00:00:00", end: "2018-05-01 04:00:00" });
    const ongoing = alert({ id: "ongoing", start: "2018-05-31 22:00:00", end: null, status: "open", severity: "critical" });
    const fa = alert({ id: "fa", start: "2018-06-01 05:00:00", end: "2018-06-01 06:00:00", label: "false_alarm" });
    const r = buildReport("2018-06-01 08:00:00", 8, pts([0.2]), [inside, before, ongoing, fa], []);
    expect(r.alerts.map((a) => a.id)).toEqual(["ongoing", "in", "fa"]);
    expect(r.counts).toMatchObject({ active: 3, opened: 2, closed: 2, stillOpen: 1, critical: 1, realIssue: 1, falseAlarm: 1, awaitingReview: 1 });
  });
  it("includes work orders for those alerts plus anything still open, but not finished unrelated ones", () => {
    const orders = [order({ id: "WO-1", alertId: "a1", status: "done" }), order({ id: "WO-2", alertId: "other", status: "done" }),
      order({ id: "WO-3", alertId: null, status: "in_progress" })];
    const r = buildReport("2018-06-01 08:00:00", 8, pts([0.2]), [alert()], orders);
    expect(r.workOrders.map((o) => o.id)).toEqual(["WO-1", "WO-3"]);
    expect(r.openWorkOrders).toBe(1);
  });
  it("says so plainly when nothing happened or there is no data", () => {
    const quiet = buildReport("2018-06-01 08:00:00", 8, pts([0.2, 0.3]), [], []);
    expect(quiet.narrative.join(" ")).toContain("No alerts were active");
    expect(quiet.narrative.join(" ")).toContain("no open work orders");
    expect(buildReport("2018-06-01 08:00:00", 8, [], [], []).narrative[0]).toContain("no recorded data");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(cell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(cell(null)).toBe("");
    expect(cell(3)).toBe("3");
  });
  it("defuses spreadsheet formulas", () => {
    expect(cell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(cell("+1")).toBe("'+1");
    expect(cell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
  it("writes a header and one row per record with CRLF line endings", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
    const csv = alertsCsv([alert({ comments: [{ id: "c", by: "sai", at: "t", text: "=cmd" }] })]);
    expect(csv.split("\r\n")[0]).toContain("peak_x_alarm_level");
    expect(csv).toContain("sai: =cmd");
    expect(workOrdersCsv([order({ title: "-1+1" })])).toContain("'-1+1");
  });
});
