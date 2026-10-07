import { describe, expect, it } from "vitest";
import { suggest, loadSensorMap } from "./suggestions.js";
import type { Alert, WorkOrder } from "./types.js";

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "a1", start: "2018-06-01 00:00:00", end: null, peakRatio: 1.4, severity: "warning", status: "open", acknowledged: false,
  topSensors: [{ sensor: "sensor_04", share: 0.4 }, { sensor: "sensor_10", share: 0.2 }, { sensor: "sensor_00", share: 0.1 }],
  summary: "", failureAfterHours: null, recovery: false, workflow: "new", label: null, comments: [], ...over,
});
const order = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: "WO-0001", alertId: "a0", title: "t", description: "", priority: "medium", status: "done", assignee: null, createdBy: "s",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-02T00:00:00Z", outcome: "Replaced the seal", ...over,
});
const ids = (s: ReturnType<typeof suggest>) => s.map((x) => x.id);

describe("suggest", () => {
  it("gives nothing for an alert operators marked as a false alarm", () => {
    expect(suggest(alert({ label: "false_alarm" }), [])).toEqual([]);
  });
  it("scales the first step with severity and recovery", () => {
    expect(suggest(alert({ severity: "critical", peakRatio: 2.6 }), [])[0]).toMatchObject({ id: "critical", priority: "high" });
    expect(suggest(alert(), [])[0]).toMatchObject({ id: "warning", priority: "medium" });
    expect(suggest(alert({ recovery: true }), [])[0].id).toBe("restart");
  });
  it("points to the matching failure's record only when the match is not weak", () => {
    const m = { failure: "2018-04-12 21:55:00", similarity: 0.72, fingerprint: [], known_failures: 3 };
    expect(ids(suggest(alert({ match: { ...m, level: "strong" } }), []))).toContain("match");
    expect(ids(suggest(alert({ match: { ...m, level: "weak" } }), []))).not.toContain("match");
  });
  it("names the component for mapped sensors and stays generic for the rest", () => {
    const s = suggest(alert(), [], { sensor_04: "Drive-end bearing" });
    expect(s.find((x) => x.id === "sensor-sensor_04")?.text).toContain("Drive-end bearing");
    expect(s.find((x) => x.id === "sensor-sensor_10")?.text).toContain("instrument");
  });
  it("reuses what a completed work order found when the same sensors drove an earlier alert", () => {
    const earlier = alert({ id: "a0" });
    const s = suggest(alert(), [{ order: order(), alert: earlier }]);
    expect(s.find((x) => x.id === "history-WO-0001")?.text).toContain("Replaced the seal");
  });
  it("ignores history from unrelated sensors, unfinished orders, and the alert itself", () => {
    const other = alert({ id: "a0", topSensors: [{ sensor: "sensor_20", share: 0.5 }, { sensor: "sensor_21", share: 0.2 }, { sensor: "sensor_22", share: 0.1 }] });
    expect(ids(suggest(alert(), [{ order: order(), alert: other }]))).not.toContain("history-WO-0001");
    expect(ids(suggest(alert(), [{ order: order({ status: "open" }), alert: alert({ id: "a0" }) }]))).not.toContain("history-WO-0001");
    expect(ids(suggest(alert(), [{ order: order(), alert: alert() }]))).not.toContain("history-WO-0001");
  });
});

describe("loadSensorMap", () => {
  it("returns an empty map when the file is missing", () => {
    expect(loadSensorMap("/definitely/not/here.json")).toEqual({});
  });
});
