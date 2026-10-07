import jwt from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function login(user: string, pass: string): string | null {
  if (!same(user, config.demoUser) || !same(pass, config.demoPass)) return null;
  return jwt.sign({ sub: user }, config.jwtSecret, { expiresIn: "12h" });
}

export function verify(token: string | undefined): boolean {
  if (!token) return false;
  try { jwt.verify(token, config.jwtSecret); return true; } catch { return false; }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? "";
  if (verify(h.startsWith("Bearer ") ? h.slice(7) : undefined)) return next();
  res.status(401).json({ error: "unauthorised" });
}
