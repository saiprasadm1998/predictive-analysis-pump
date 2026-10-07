import { describe, expect, it } from "vitest";
import { message, Notifier } from "./notify.js";
import type { Alert } from "./types.js";

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "a1", start: "2018-06-01 03:30:00", end: null, peakRatio: 1.4, severity: "warning", status: "open", acknowledged: false,
  topSensors: [{ sensor: "sensor_04", share: 0.4 }, { sensor: "sensor_10", share: 0.2 }], summary: "", failureAfterHours: null,
  recovery: false, workflow: "new", label: null, comments: [], ...over,
});

function setup(over: Record<string, unknown> = {}, status = 200) {
  const sent: string[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).text);
    return new Response("ok", { status });
  }) as unknown as typeof fetch;
  let t = 0;
  const n = new Notifier({ url: "https://hooks.example/x", minSeverity: "warning", dashboardUrl: "http://localhost:5173", maxPerMinute: 3, fetchImpl, now: () => t, ...over });
  return { n, sent, advance: (ms: number) => { t += ms; } };
}

describe("Notifier", () => {
  it("sends nothing when no webhook is configured", async () => {
    const { n, sent } = setup({ url: "" });
    await n.onAlert(alert());
    expect(sent).toHaveLength(0);
    expect(n.status().enabled).toBe(false);
  });
  it("announces an alert once, even when it is reported again and again", async () => {
    const { n, sent } = setup();
    for (let i = 0; i < 4; i++) await n.onAlert(alert());
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Warning opened");
    expect(sent[0]).toContain("Sensor 04 (40%)");
  });
  it("announces escalation to critical once, and an alert that opens critical only once", async () => {
    const a = setup();
    await a.n.onAlert(alert());
    await a.n.onAlert(alert({ severity: "critical", peakRatio: 2.4 }));
    await a.n.onAlert(alert({ severity: "critical", peakRatio: 2.8 }));
    expect(a.sent).toHaveLength(2);
    expect(a.sent[1]).toContain("escalated to critical");
    const b = setup();
    await b.n.onAlert(alert({ id: "a2", severity: "critical" }));
    await b.n.onAlert(alert({ id: "a2", severity: "critical" }));
    expect(b.sent).toHaveLength(1);
  });
  it("respects the minimum severity and skips closed and restart alerts", async () => {
    const { n, sent } = setup({ minSeverity: "critical" });
    await n.onAlert(alert());
    await n.onAlert(alert({ id: "a3", severity: "critical", status: "closed" }));
    await n.onAlert(alert({ id: "a4", severity: "critical", recovery: true }));
    expect(sent).toHaveLength(0);
    await n.onAlert(alert({ id: "a5", severity: "critical" }));
    expect(sent).toHaveLength(1);
  });
  it("holds messages back past the per-minute limit and counts them", async () => {
    const { n, sent, advance } = setup();
    for (let i = 0; i < 5; i++) await n.onAlert(alert({ id: `b${i}` }));
    expect(sent).toHaveLength(3);
    expect(n.status().dropped).toBe(2);
    advance(61_000);
    await n.onAlert(alert({ id: "b9" }));
    expect(sent).toHaveLength(4);
  });
  it("survives a failing webhook and reports the error", async () => {
    const { n } = setup({}, 500);
    await expect(n.onAlert(alert())).resolves.toBeUndefined();
    expect(n.status().lastError).toContain("500");
    await expect(n.test()).rejects.toThrow("500");
  });
  it("test message fails clearly when notifications are off", async () => {
    await expect(setup({ url: "" }).n.test()).rejects.toThrow("not configured");
  });
});

describe("message", () => {
  it("escapes Slack markup in interpolated text but keeps the dashboard link", () => {
    const m = message(alert({ topSensors: [{ sensor: "sensor_<b>&", share: 0.1 }] }), "opened", "http://localhost:5173");
    expect(m).toContain("&lt;b&gt;&amp;");
    expect(m).toContain("<http://localhost:5173|Open the dashboard>");
  });
  it("mentions a strong match to a recorded failure but not a weak one", () => {
    const m = { failure: "2018-04-12 21:55:00", similarity: 0.72, fingerprint: [], known_failures: 2 };
    expect(message(alert({ match: { ...m, level: "strong" } }), "opened", "u")).toContain("Strong match to the 12 Apr, 21:55 failure (72% alike)");
    expect(message(alert({ match: { ...m, level: "weak" } }), "opened", "u")).not.toContain("match");
  });
});
