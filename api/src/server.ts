import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import { login, requireAuth, verify } from "./auth.js";
import { ml } from "./ml.js";
import { Replay } from "./replay.js";

const app = express();
app.use(cors());
app.use(express.json());

const replay = new Replay();

app.post("/api/auth/login", (req, res) => {
  const token = login(String(req.body?.username ?? ""), String(req.body?.password ?? ""));
  token ? res.json({ token }) : res.status(401).json({ error: "bad credentials" });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", requireAuth);

app.get("/api/state", (_req, res) => res.json(replay.state()));
app.get("/api/meta", async (_req, res) => res.json(await ml.meta()));

app.post("/api/replay", async (req, res) => {
  const { action, t, speed } = req.body ?? {};
  if (action === "play") replay.play();
  else if (action === "pause") replay.pause();
  else if (action === "speed" && Number.isFinite(speed)) replay.setSpeed(speed);
  else if (action === "seek" && typeof t === "string") await replay.seek(t);
  else return res.status(400).json({ error: "bad action" });
  res.json(replay.state());
});

/** Jump-to-failure scenarios: start 72h before each recorded failure. */
app.get("/api/scenarios", async (_req, res) => {
  const meta = await ml.meta();
  res.json(meta.evaluation.failures.map((f, i) => {
    const fail = Date.parse(f.failure.replace(" ", "T") + "Z");
    return { id: i + 1, failure: f.failure, leadHours: f.lead_hours,
      startAt: new Date(fail - 72 * 3600e3).toISOString().slice(0, 19).replace("T", " "),
      topSensors: f.top_sensors };
  }));
});

app.get("/api/alerts", (_req, res) => res.json(replay.engine.alerts));
app.post("/api/alerts/:id/ack", (req, res) => {
  const a = replay.engine.ack(Number(req.params.id));
  a ? res.json(a) : res.status(404).json({ error: "not found" });
});

app.get("/api/scores", async (req, res) =>
  res.json(await ml.scores(String(req.query.start), String(req.query.end), Number(req.query.step ?? 60))));
app.get("/api/readings", async (req, res) =>
  res.json(await ml.readings(String(req.query.start), String(req.query.end), String(req.query.sensors), Number(req.query.step ?? 15))));

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
replay.on("alert", (a) => send("alert", a));
replay.on("state", (s) => send("state", s));
replay.on("error", (e: Error) => console.error("replay:", e.message));

replay.init().then(() => {
  server.listen(config.port, () => console.log(`API on :${config.port}`));
}).catch((e) => { console.error("cannot reach ML service:", e.message); process.exit(1); });
