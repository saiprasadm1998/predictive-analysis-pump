import { describe, it, expect } from "vitest";
import { AlertEngine } from "./alerts.js";
import type { Reading } from "./types.js";

const r = (ratio: number, runAbove = 0, runBelow = 0): Reading => ({
  t: "2018-05-19 03:00:00", health: 50, ratio, state: "warning", label: "NORMAL", run_above: runAbove, run_below: runBelow, match: null,
  top_sensors: [{ sensor: "sensor_04", share: 0.5 }],
});

describe("AlertEngine", () => {
  it("opens only after the anomaly persists", () => {
    const e = new AlertEngine();
    expect(e.push(r(1.5, 5))).toBeNull();
    expect(e.push(r(1.5, 29))).toBeNull();
    expect(e.push(r(1.5, 30))?.status).toBe("open");
  });
  it("ignores a short spike", () => {
    const e = new AlertEngine();
    e.push(r(3, 2)); e.push(r(0.3, 0, 10));
    expect(e.alerts).toHaveLength(0);
  });
  it("escalates to critical and closes after sustained recovery", () => {
    const e = new AlertEngine();
    e.push(r(1.2, 40));
    e.push(r(2.5, 90));
    expect(e.alerts[0].severity).toBe("critical");
    e.push(r(0.2, 0, 60));
    expect(e.alerts[0].status).toBe("open");
    e.push(r(0.2, 0, 180));
    expect(e.alerts[0].status).toBe("closed");
  });
});

describe("AlertEngine ids and reset", () => {
  it("derives a stable id from the start time", () => {
    const e = new AlertEngine();
    expect(e.push(r(1.5, 30))?.id).toBe("a20180519030000");
  });
  it("closes the open alert on reset", () => {
    const e = new AlertEngine();
    e.push(r(1.5, 30));
    const closed = e.reset();
    expect(closed?.status).toBe("closed");
    expect(e.alerts).toHaveLength(0);
  });
});

describe("AlertEngine pattern match", () => {
  it("keeps the match from the peak reading", () => {
    const e = new AlertEngine();
    const m = (sim: number) => ({ failure: "2018-04-12 21:55:00", similarity: sim, level: "weak" as const, fingerprint: [], known_failures: 1 });
    e.push({ ...r(1.5, 30), match: m(0.2) });
    e.push({ ...r(2.4, 60), match: m(0.7) });
    e.push({ ...r(1.8, 90), match: m(0.1) });
    expect(e.alerts[0].match?.similarity).toBe(0.7);
  });
});
