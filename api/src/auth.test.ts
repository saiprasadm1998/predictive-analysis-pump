import { describe, expect, it } from "vitest";
import { hashPassword, login, verify } from "./auth.js";
import { memoryStore } from "./store/memory.js";
import { createUserBody, replayBody, readingsQuery } from "./schemas.js";

describe("auth", () => {
  it("logs in with the right password only, and carries the role", async () => {
    const store = memoryStore();
    await store.users.create({ username: "op", passwordHash: await hashPassword("correct-horse"), role: "operator" });
    expect(await login(store, "op", "wrong")).toBeNull();
    expect(await login(store, "nobody", "correct-horse")).toBeNull();
    const token = await login(store, "OP", "correct-horse");
    expect(verify(token!)).toMatchObject({ sub: "op", role: "operator" });
  });
  it("rejects forged and empty tokens", () => {
    expect(verify("garbage")).toBeNull();
    expect(verify(undefined)).toBeNull();
  });
});

describe("request schemas", () => {
  it("accepts valid replay actions and rejects bad ones", () => {
    expect(replayBody.safeParse({ action: "seek", t: "2018-05-19 03:18:00" }).success).toBe(true);
    expect(replayBody.safeParse({ action: "seek", t: "yesterday" }).success).toBe(false);
    expect(replayBody.safeParse({ action: "speed", speed: 9999 }).success).toBe(false);
    expect(replayBody.safeParse({ action: "explode" }).success).toBe(false);
  });
  it("enforces user rules", () => {
    expect(createUserBody.safeParse({ username: "ab", password: "longenough1", role: "viewer" }).success).toBe(false);
    expect(createUserBody.safeParse({ username: "sai", password: "short", role: "viewer" }).success).toBe(false);
    expect(createUserBody.safeParse({ username: "sai", password: "longenough1", role: "root" }).success).toBe(false);
  });
  it("only allows sensor names in readings queries", () => {
    expect(readingsQuery.safeParse({ start: "2018-05-01", end: "2018-05-02", sensors: "sensor_01,sensor_02" }).success).toBe(true);
    expect(readingsQuery.safeParse({ start: "2018-05-01", end: "2018-05-02", sensors: "../etc/passwd" }).success).toBe(false);
  });
});
