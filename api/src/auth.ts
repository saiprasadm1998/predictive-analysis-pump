import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import type { Store } from "./store/index.js";
import type { Role } from "./types.js";

export interface Session { sub: string; role: Role }
declare module "express-serve-static-core" { interface Request { session?: Session } }

const RANK: Record<Role, number> = { viewer: 1, operator: 2, admin: 3 };

export const hashPassword = (p: string) => bcrypt.hash(p, 10);

/** Create the first admin from the environment when no users exist yet. */
export async function seedAdmin(store: Store): Promise<void> {
  if ((await store.users.count()) > 0) return;
  await store.users.create({ username: config.adminUser, passwordHash: await hashPassword(config.adminPass), role: "admin" });
  console.log(`Created first admin user "${config.adminUser}"`);
}

// Constant-time-ish: always run a bcrypt compare, even for unknown users.
const DUMMY = bcrypt.hashSync("not-a-real-password", 10);

export async function login(store: Store, username: string, password: string): Promise<string | null> {
  const user = await store.users.find(username);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY);
  if (!user || !ok) return null;
  return jwt.sign({ sub: user.username, role: user.role } satisfies Session, config.jwtSecret, { expiresIn: "12h" });
}

export function verify(token: string | undefined): Session | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret) as Session;
    return p.sub && p.role in RANK ? p : null;
  } catch { return null; }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? "";
  const s = verify(h.startsWith("Bearer ") ? h.slice(7) : undefined);
  if (!s) return void res.status(401).json({ error: "unauthorised" });
  req.session = s;
  next();
}

export const requireRole = (min: Role) => (req: Request, res: Response, next: NextFunction) =>
  req.session && RANK[req.session.role] >= RANK[min] ? next() : void res.status(403).json({ error: "forbidden" });

/** Simple in-memory login throttle: 8 failures per 15 minutes per key. */
const fails = new Map<string, { n: number; until: number }>();
export function throttled(key: string): boolean {
  const f = fails.get(key);
  return !!f && f.n >= 8 && Date.now() < f.until;
}
export function recordFailure(key: string) {
  const f = fails.get(key);
  fails.set(key, { n: (f && Date.now() < f.until ? f.n : 0) + 1, until: Date.now() + 15 * 60e3 });
}
export const clearFailures = (key: string) => void fails.delete(key);
