import { EventEmitter } from "node:events";
import { config } from "./config.js";
import { ml } from "./ml.js";
import { AlertEngine } from "./alerts.js";
import type { Reading } from "./types.js";

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const parse = (t: string) => Date.parse(t.replace(" ", "T") + "Z");

/** Replays the historical dataset as if it were live, one tick per interval. */
export class Replay extends EventEmitter {
  playing = false;
  speed = 30;               // simulated minutes per tick
  now = 0;                  // simulated time, ms
  start = 0;
  end = 0;
  latest: Reading | null = null;
  engine = new AlertEngine();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  async init(): Promise<void> {
    const meta = await ml.meta();
    this.start = parse(meta.start);
    this.end = parse(meta.end);
    this.now = this.start + 60 * 60e3;
    this.engine.setFailures(meta.evaluation.failures.map((f) => f.failure));
    this.latest = await ml.at(fmt(this.now));
  }

  state() {
    return { playing: this.playing, speed: this.speed, t: fmt(this.now), start: fmt(this.start), end: fmt(this.end), latest: this.latest };
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.timer = setInterval(() => void this.tick(), config.tickMs);
    this.emit("state", this.state());
  }

  pause() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emit("state", this.state());
  }

  setSpeed(minutesPerTick: number) {
    this.speed = Math.min(Math.max(Math.round(minutesPerTick), 1), 720);
    this.emit("state", this.state());
  }

  async seek(t: string) {
    const ms = Math.min(Math.max(parse(t), this.start), this.end);
    this.now = ms;
    const closed = this.engine.reset();
    if (closed) this.emit("alert", closed);
    this.latest = await ml.at(fmt(ms));
    this.emit("reading", this.latest);
    this.emit("state", this.state());
  }

  private async tick() {
    if (this.busy) return;            // skip if the previous call is still running
    this.busy = true;
    try {
      this.now += this.speed * 60e3;
      if (this.now >= this.end) { this.now = this.end; this.pause(); }
      const r = await ml.at(fmt(this.now));
      this.latest = r;
      const alert = this.engine.push(r);
      this.emit("reading", r);
      if (alert) this.emit("alert", alert);
    } catch (e) {
      this.emit("error", e);
    } finally {
      this.busy = false;
    }
  }
}
