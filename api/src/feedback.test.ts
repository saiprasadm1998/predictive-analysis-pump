import { describe, expect, it } from "vitest";
import { feedback } from "./feedback.js";
import type { Alert, Label } from "./types.js";

const a = (peakRatio: number, label: Label | null): Alert => ({
  id: String(Math.random()), start: "2018-01-01 00:00:00", end: null, peakRatio, severity: "warning", status: "closed",
  acknowledged: true, topSensors: [], summary: "", failureAfterHours: null, recovery: false, workflow: "resolved", label, comments: [],
});

describe("feedback", () => {
  it("asks for more labels before suggesting anything", () => {
    expect(feedback([a(1.1, "false_alarm"), a(2, "real_issue")]).suggestion).toBeNull();
  });
  it("suggests a level that silences false alarms without losing real issues", () => {
    const f = feedback([a(1.1, "false_alarm"), a(1.2, "false_alarm"), a(1.9, "real_issue"), a(2.4, "real_issue")]);
    expect(f.suggestion).toMatchObject({ silenced: 2, lost: 0 });
    expect(f.suggestion!.level).toBeGreaterThan(1.2);
    expect(f.suggestion!.level).toBeLessThan(1.9);
  });
  it("refuses to suggest when real issues peak lower than false alarms", () => {
    const f = feedback([a(1.5, "false_alarm"), a(1.6, "false_alarm"), a(1.1, "real_issue"), a(1.2, "real_issue")]);
    expect(f.suggestion).toBeNull();
    expect(f.note).toContain("similar");
  });
  it("counts unlabelled alerts", () => {
    expect(feedback([a(1.1, null), a(1.2, null)]).unlabelled).toBe(2);
  });
});
