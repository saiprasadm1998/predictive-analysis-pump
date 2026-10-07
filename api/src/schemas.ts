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
