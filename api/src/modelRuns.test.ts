import { describe, expect, it } from "vitest";
import { runFrom, verdictWindows } from "./modelRuns.js";
import type { Meta } from "./ml.js";
import type { Alert, Label } from "./types.js";

const alert = (start: string, end: string | null, label: Label | null): Alert => ({
  id: "a" + start, start, end, peakRatio: 1.2, severity: "warning", status: end ? "closed" : "open", acknowledged: false,
  topSensors: [], summary: "", failureAfterHours: null, recovery: false, workflow: "new", label, comments: [],
});

describe("verdictWindows", () => {
  it("sends false alarms to include and real issues to exclude, ignoring unlabelled", () => {
    const w = verdictWindows([
      alert("2018-05-01 00:00:00", "2018-05-01 06:00:00", "false_alarm"),
      alert("2018-05-10 00:00:00", "2018-05-10 03:00:00", "real_issue"),
      alert("2018-05-20 00:00:00", "2018-05-20 03:00:00", null),
    ]);
    expect(w.include).toEqual([["2018-05-01 00:00:00", "2018-05-01 06:00:00"]]);
    expect(w.exclude).toEqual([["2018-05-10 00:00:00", "2018-05-10 03:00:00"]]);
  });
  it("gives an alert that is still open a six hour window", () => {
    expect(verdictWindows([alert("2018-05-01 22:00:00", null, "false_alarm")]).include[0]).toEqual(["2018-05-01 22:00:00", "2018-05-02 04:00:00"]);
  });
});

describe("runFrom", () => {
  const meta = { threshold: 223.2, level: 1.25, train: {}, evaluation: { failures_detected: 3, failures_total: 7, healthy_alarm_rate: 0.01, healthy_false_alarm_episodes: 5 } } as unknown as Meta;
  it("records the level and gives retrains a unique id", () => {
    const a = runFrom(meta, "startup");
    expect(a).toMatchObject({ level: 1.25, failuresDetected: 3, healthyFalseAlarmEpisodes: 5, trigger: "startup" });
    expect(runFrom(meta, "startup").id).toBe(a.id);
  });
});
