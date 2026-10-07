import { DuplicateError, type Store } from "./types.js";
import type { Alert, ModelRun, User } from "../types.js";

/** In-memory store: used when MONGODB_URI is not set, and in tests. */
export function memoryStore(): Store {
  const users = new Map<string, User>();
  const alerts = new Map<string, Alert>();
  const runs = new Map<string, ModelRun>();
  return {
    kind: "memory",
    async init() {},
    async close() {},
    users: {
      async count() { return users.size; },
      async find(username) { return users.get(username.toLowerCase()) ?? null; },
      async create(u) {
        const key = u.username.toLowerCase();
        if (users.has(key)) throw new DuplicateError("username taken");
        const user: User = { ...u, username: key, createdAt: new Date().toISOString() };
        users.set(key, user);
        return user;
      },
      async list() { return [...users.values()].map(({ passwordHash: _p, ...rest }) => rest); },
    },
    alerts: {
      async upsert(a) {
        const old = alerts.get(a.id);
        alerts.set(a.id, { ...a, acknowledged: old?.acknowledged ?? false,
          acknowledgedBy: old?.acknowledgedBy, acknowledgedAt: old?.acknowledgedAt });
      },
      async get(id) { return alerts.get(id) ?? null; },
      async list(upTo) {
        return [...alerts.values()].filter((a) => !upTo || a.start <= upTo).sort((a, b) => (a.start < b.start ? 1 : -1));
      },
      async ack(id, by) {
        const a = alerts.get(id);
        if (!a) return null;
        const next = { ...a, acknowledged: true, acknowledgedBy: by, acknowledgedAt: new Date().toISOString() };
        alerts.set(id, next);
        return next;
      },
    },
    modelRuns: {
      async record(r) { if (!runs.has(r.id)) runs.set(r.id, r); },
      async list() { return [...runs.values()].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1)); },
    },
  };
}
