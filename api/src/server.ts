import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { ZodType } from "zod";
import { config } from "./config.js";
import { clearFailures, hashPassword, login, recordFailure, requireAuth, requireRole, seedAdmin, throttled, verify } from "./auth.js";
import { ml } from "./ml.js";
import { Replay } from "./replay.js";
import { createStore, DuplicateError } from "./store/index.js";
import { commentBody, createUserBody, loginBody, readingsQuery, replayBody, scoresQuery, workflowBody } from "./schemas.js";
import { feedback } from "./feedback.js";
import type { Alert } from "./types.js";

const store = createStore();
const replay = new Replay();
const app = express();
app.use(cors());
app.use(express.json({ limit: "20kb" }));

/** Validate and return typed input, or answer 400 with the first problem. */
function parse<T>(schema: ZodType<T>, data: unknown, res: express.Response): T | null {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  res.status(400).json({ error: "invalid request", detail: r.error.issues[0]?.message ?? "bad input" });
  return null;
}
const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get("/api/health", (_req, res) => res.json({ ok: true, store: store.kind }));

app.post("/api/auth/login", wrap(async (req, res) => {
  const body = parse(loginBody, req.body, res);
  if (!body) return;
  const key = `${req.ip}:${body.username.toLowerCase()}`;
  if (throttled(key)) return void res.status(429).json({ error: "too many attempts, try again later" });
  const token = await login(store, body.username, body.password);
  if (!token) { recordFailure(key); return void res.status(401).json({ error: "bad credentials" }); }
  clearFailures(key);
  res.json({ token });
}));

app.use("/api", requireAuth);

app.get("/api/me", (req, res) => res.json({ username: req.session!.sub, role: req.session!.role }));
app.get("/api/state", (_req, res) => res.json(replay.state()));
app.get("/api/meta", wrap(async (_req, res) => res.json(await ml.meta())));

app.post("/api/replay", requireRole("operator"), wrap(async (req, res) => {
  const b = parse(replayBody, req.body, res);
  if (!b) return;
  if (b.action === "play") replay.play();
  else if (b.action === "pause") replay.pause();
  else if (b.action === "speed") replay.setSpeed(b.speed);
  else await replay.seek(b.t);
  res.json(replay.state());
}));

/** Jump-to-failure scenarios: start 72h before each recorded failure. */
app.get("/api/scenarios", wrap(async (_req, res) => {
  const meta = await ml.meta();
  res.json(meta.evaluation.failures.map((f, i) => {
    const fail = Date.parse(f.failure.replace(" ", "T") + "Z");
    return { id: i + 1, failure: f.failure, leadHours: f.lead_hours,
      startAt: new Date(fail - 72 * 3600e3).toISOString().slice(0, 19).replace("T", " "),
      topSensors: f.top_sensors };
  }));
}));

app.get("/api/failures", wrap(async (_req, res) => res.json(await ml.failures())));

app.get("/api/alerts", wrap(async (_req, res) => res.json(await store.alerts.list(replay.state().t))));
app.post("/api/alerts/:id/ack", requireRole("operator"), wrap(async (req, res) => {
  const a = await store.alerts.ack(String(req.params.id), req.session!.sub);
  a ? res.json(a) : res.status(404).json({ error: "not found" });
}));

app.post("/api/alerts/:id/workflow", requireRole("operator"), wrap(async (req, res) => {
  const body = workflowBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "invalid" });
  const a = await store.alerts.setWorkflow(String(req.params.id), body.data, req.session!.sub);
  a ? (send("alert", a), res.json(a)) : res.status(404).json({ error: "not found" });
}));
app.post("/api/alerts/:id/comments", requireRole("operator"), wrap(async (req, res) => {
  const body = commentBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "comment must be 1-1000 characters" });
  const c = { id: randomUUID(), by: req.session!.sub, at: new Date().toISOString(), text: body.data.text };
  const a = await store.alerts.addComment(String(req.params.id), c);
  a ? (send("alert", a), res.json(a)) : res.status(404).json({ error: "not found" });
}));
app.get("/api/feedback", wrap(async (_req, res) => res.json(feedback(await store.alerts.list(replay.state().t)))));

app.get("/api/model-runs", wrap(async (_req, res) => res.json(await store.modelRuns.list())));

app.get("/api/users", requireRole("admin"), wrap(async (_req, res) => res.json(await store.users.list())));
app.post("/api/users", requireRole("admin"), wrap(async (req, res) => {
  const b = parse(createUserBody, req.body, res);
  if (!b) return;
  try {
    const u = await store.users.create({ username: b.username, passwordHash: await hashPassword(b.password), role: b.role });
    res.status(201).json({ username: u.username, role: u.role, createdAt: u.createdAt });
  } catch (e) {
    if (e instanceof DuplicateError) return void res.status(409).json({ error: "username taken" });
    throw e;
  }
}));

app.get("/api/scores", wrap(async (req, res) => {
  const q = parse(scoresQuery, req.query, res);
  if (q) res.json(await ml.scores(q.start, q.end, q.step));
}));
app.get("/api/readings", wrap(async (req, res) => {
  const q = parse(readingsQuery, req.query, res);
  if (q) res.json(await ml.readings(q.start, q.end, q.sensors, q.step));
}));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message);
  res.status(502).json({ error: "upstream or server error" });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const send = (type: string, data: unknown) => {
  const msg = JSON.stringify({ type, data });
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
};
wss.on("connection", (ws, req) => {
  const token = new URL(req.url ?? "", "http://x").searchParams.get("token") ?? undefined;
  if (!verify(token)) return ws.close(4401, "unauthorised");
  ws.send(JSON.stringify({ type: "state", data: replay.state() }));
});
replay.on("reading", (r) => send("reading", r));
replay.on("alert", (a: Alert) => {
  // persist first, then tell clients; the stored copy keeps any acknowledgement
  store.alerts.upsert(a).then(() => store.alerts.get(a.id)).then((saved) => send("alert", saved ?? a))
    .catch((e: Error) => console.error("alert save failed:", e.message));
});
replay.on("state", (s) => send("state", s));
replay.on("error", (e: Error) => console.error("replay:", e.message));

async function main() {
  await store.init();
  await seedAdmin(store);
  await replay.init();
  const meta = await ml.meta();
  const ev = meta.evaluation;
  await store.modelRuns.record({
    id: `thr-${meta.threshold.toFixed(3)}-d${ev.failures_detected}-e${ev.healthy_false_alarm_episodes}`, recordedAt: new Date().toISOString(), threshold: meta.threshold,
    failuresDetected: ev.failures_detected, failuresTotal: ev.failures_total,
    healthyAlarmRate: ev.healthy_alarm_rate, healthyFalseAlarmEpisodes: ev.healthy_false_alarm_episodes,
  });
  server.listen(config.port, () => console.log(`API on :${config.port} (store: ${store.kind})`));
}
main().catch((e: Error) => { console.error("startup failed:", e.message); process.exit(1); });
