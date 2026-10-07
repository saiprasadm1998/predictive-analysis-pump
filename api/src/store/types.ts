import type { Alert, ModelRun, Role, User } from "../types.js";

export interface Store {
  readonly kind: "mongo" | "memory";
  init(): Promise<void>;
  close(): Promise<void>;
  users: {
    count(): Promise<number>;
    find(username: string): Promise<User | null>;
    create(u: { username: string; passwordHash: string; role: Role }): Promise<User>;
    list(): Promise<Omit<User, "passwordHash">[]>;
  };
  alerts: {
    /** Insert or update by id; never overwrites acknowledgement fields. */
    upsert(a: Alert): Promise<void>;
    get(id: string): Promise<Alert | null>;
    /** Alerts that started at or before `upTo` (replay time), newest first. */
    list(upTo?: string): Promise<Alert[]>;
    ack(id: string, by: string): Promise<Alert | null>;
  };
  modelRuns: {
    record(r: ModelRun): Promise<void>;
    list(): Promise<ModelRun[]>;
  };
}

export class DuplicateError extends Error {}
