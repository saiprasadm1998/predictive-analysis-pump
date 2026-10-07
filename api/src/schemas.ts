import { z } from "zod";

export const loginBody = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });

export const replayBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("play") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("speed"), speed: z.number().int().min(1).max(720) }),
  z.object({ action: z.literal("seek"), t: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/) }),
]);

export const createUserBody = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(200),
  role: z.enum(["viewer", "operator", "admin"]),
});

const ts = z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/);
export const scoresQuery = z.object({ start: ts, end: ts, step: z.coerce.number().int().min(1).max(1440).default(60) });
export const readingsQuery = z.object({
  start: ts, end: ts, step: z.coerce.number().int().min(1).max(1440).default(15),
  sensors: z.string().regex(/^sensor_\d{2}(,sensor_\d{2}){0,5}$/),
});

export const workflowBody = z.object({
  workflow: z.enum(["new", "investigating", "resolved"]).optional(),
  label: z.enum(["real_issue", "false_alarm"]).nullable().optional(),
}).refine((b) => b.workflow !== undefined || b.label !== undefined, { message: "nothing to change" });

export const commentBody = z.object({ text: z.string().trim().min(1).max(1000) });

export const levelBody = z.object({ level: z.number().min(0.3).max(5) });
export const previewQuery = z.object({ level: z.coerce.number().min(0.3).max(5) });

const priority = z.enum(["low", "medium", "high"]);
export const createWorkOrderBody = z.object({
  alertId: z.string().max(40).nullable().optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(""),
  priority: priority.default("medium"),
  assignee: z.string().trim().min(1).max(64).nullable().optional(),
});
export const updateWorkOrderBody = z.object({
  status: z.enum(["open", "in_progress", "done"]).optional(),
  assignee: z.string().trim().min(1).max(64).nullable().optional(),
  priority: priority.optional(),
  outcome: z.string().trim().min(3).max(1000).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: "nothing to change" });
export const workOrdersQuery = z.object({
  alertId: z.string().max(40).optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
});
