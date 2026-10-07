import type { Alert, Comment, Label, ModelRun, Priority, Role, User, WorkOrder, WorkStatus, Workflow } from "../types.js";

export interface Store {
  readonly kind: "memory";
  init(): Promise<void>;
  close(): Promise<void>;
  users: {
    count(): Promise<number>;
    find(username: string): Promise<User | null>;
    create(u: { username: string; passwordHash: string; role: Role }): Promise<User>;
    list(): Promise<Omit<User, "passwordHash">[]>;
  };
  alerts: {
    /** Insert or update by id; never overwrites acknowledgement or workflow fields. */
    upsert(a: Alert): Promise<void>;
    get(id: string): Promise<Alert | null>;
    /** Alerts that started at or before `upTo` (replay time), newest first. */
    list(upTo?: string): Promise<Alert[]>;
    ack(id: string, by: string): Promise<Alert | null>;
    /** Operator changes: status and/or verdict. Null label clears it. */
    setWorkflow(id: string, patch: { workflow?: Workflow; label?: Label | null }, by: string): Promise<Alert | null>;
    addComment(id: string, c: Comment): Promise<Alert | null>;
  };
  workOrders: {
    create(input: { alertId: string | null; title: string; description: string; priority: Priority; assignee: string | null }, by: string): Promise<WorkOrder>;
    get(id: string): Promise<WorkOrder | null>;
    /** Newest first. */
    list(filter?: { alertId?: string; status?: WorkStatus }): Promise<WorkOrder[]>;
    update(id: string, patch: { status?: WorkStatus; assignee?: string | null; priority?: Priority; outcome?: string }): Promise<WorkOrder | null>;
  };
  modelRuns: {
    record(r: ModelRun): Promise<void>;
    list(): Promise<ModelRun[]>;
  };
}

export class DuplicateError extends Error {}
