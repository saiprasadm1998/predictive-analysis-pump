import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryStore } from "./memory.js";
import { mongoStore } from "./mongo.js";
import { DuplicateError, type Store } from "./types.js";
import type { Alert } from "../types.js";

const alert = (start: string, over: Partial<Alert> = {}): Alert => ({
  id: "a" + start.replace(/\D/g, ""), start, end: null, peakRatio: 1.4, severity: "warning", status: "open",
  acknowledged: false, topSensors: [{ sensor: "sensor_04", share: 0.5 }], summary: "s", failureAfterHours: null,
  recovery: false, ...over,
});

// The same contract runs against memory always, and against MongoDB/Atlas when TEST_MONGODB_URI is set.
const targets: [string, () => Store][] = [["memory", memoryStore]];
if (process.env.TEST_MONGODB_URI) {
  targets.push(["mongo", () => mongoStore(process.env.TEST_MONGODB_URI!, `pg_test_${Date.now()}`)]);
}

describe.each(targets)("store contract: %s", (_name, make) => {
  const store = make();
  beforeAll(() => store.init());
  afterAll(() => store.close());

  it("creates users, rejects duplicates case-insensitively, hides hashes in list", async () => {
    await store.users.create({ username: "Sai", passwordHash: "h", role: "admin" });
    await expect(store.users.create({ username: "sai", passwordHash: "h", role: "viewer" })).rejects.toBeInstanceOf(DuplicateError);
    expect((await store.users.find("SAI"))?.role).toBe("admin");
    expect(await store.users.count()).toBe(1);
    expect(JSON.stringify(await store.users.list())).not.toContain("passwordHash");
  });

  it("upserts alerts without duplicating or losing acknowledgements", async () => {
    await store.alerts.upsert(alert("2018-05-16 07:18:00"));
    const acked = await store.alerts.ack("a20180516071800", "sai");
    expect(acked?.acknowledgedBy).toBe("sai");
    await store.alerts.upsert(alert("2018-05-16 07:18:00", { status: "closed", end: "2018-05-16 13:18:00", peakRatio: 2.2 }));
    const all = await store.alerts.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: "closed", peakRatio: 2.2, acknowledged: true, acknowledgedBy: "sai" });
  });

  it("lists newest first and hides alerts from the replay's future", async () => {
    await store.alerts.upsert(alert("2018-06-01 00:00:00"));
    expect((await store.alerts.list()).map((a) => a.start)).toEqual(["2018-06-01 00:00:00", "2018-05-16 07:18:00"]);
    expect(await store.alerts.list("2018-05-20 00:00:00")).toHaveLength(1);
  });

  it("returns null when acknowledging an unknown alert", async () => {
    expect(await store.alerts.ack("nope", "sai")).toBeNull();
  });

  it("records each model run once", async () => {
    const run = { id: "thr-1", recordedAt: "2026-10-07T00:00:00Z", threshold: 223, failuresDetected: 6, failuresTotal: 7, healthyAlarmRate: 0.01, healthyFalseAlarmEpisodes: 13 };
    await store.modelRuns.record(run);
    await store.modelRuns.record({ ...run, recordedAt: "2026-10-08T00:00:00Z" });
    expect(await store.modelRuns.list()).toHaveLength(1);
  });
});
