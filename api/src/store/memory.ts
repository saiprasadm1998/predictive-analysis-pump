import { DuplicateError, type Store } from "./types.js";
import type { Alert, Comment, Label, ModelRun, User, Workflow } from "../types.js";

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
          acknowledgedBy: old?.acknowledgedBy, acknowledgedAt: old?.acknowledgedAt,
          workflow: old?.workflow ?? "new", label: old?.label ?? null, labelledBy: old?.labelledBy,
          comments: old?.comments ?? [] });
      },
      async get(id) { return alerts.get(id) ?? null; },
      async list(upTo) {
        return [...alerts.values()].filter((a) => !upTo || a.start <= upTo).sort((a, b) => (a.start < b.start ? 1 : -1));
      },
      async ack(id, by) {
        const a = alerts.get(id);
        if (!a) return null;
        const next: Alert = { ...a, acknowledged: true, acknowledgedBy: by, acknowledgedAt: new Date().toISOString(),
          workflow: a.workflow === "new" ? "investigating" : a.workflow };
        alerts.set(id, next);
        return next;
      },
      async setWorkflow(id, patch, by) {
        const a = alerts.get(id);
        if (!a) return null;
        const next: Alert = { ...a };
        if (patch.workflow) {
          next.workflow = patch.workflow;
          if (!next.acknowledged) { next.acknowledged = true; next.acknowledgedBy = by; next.acknowledgedAt = new Date().toISOString(); }
        }
        if (patch.label !== undefined) { next.label = patch.label; next.labelledBy = patch.label ? by : undefined; }
        alerts.set(id, next);
        return next;
      },
      async addComment(id, c) {
        const a = alerts.get(id);
        if (!a) return null;
        const next: Alert = { ...a, comments: [...a.comments, c] };
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
