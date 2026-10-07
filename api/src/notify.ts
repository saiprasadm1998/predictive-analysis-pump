import type { Alert } from "./types.js";

export interface NotifyOptions {
  url: string;                       // Slack incoming-webhook URL; empty disables notifications
  minSeverity: "warning" | "critical";
  dashboardUrl: string;
  maxPerMinute: number;              // protects the channel when the replay runs fast and opens many alerts
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface NotifyStatus {
  enabled: boolean;
  minSeverity: "warning" | "critical";
  sent: number;
  dropped: number;                   // held back by the rate limit
  lastError: string | null;
  lastSentAt: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (t: string) => `${Number(t.slice(8, 10))} ${MONTHS[Number(t.slice(5, 7)) - 1]}, ${t.slice(11, 16)}`;
const name = (s: string) => s.replace("sensor_", "Sensor ");

/** Slack mrkdwn treats & < > as markup, so anything we interpolate is escaped. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function message(a: Alert, event: "opened" | "critical", dashboardUrl: string): string {
  const head = event === "critical"
    ? `:rotating_light: *Alert escalated to critical* on pump P-101 (peak ${a.peakRatio.toFixed(1)}x the alarm level)`
    : `:warning: *${a.severity === "critical" ? "Critical alert" : "Warning"} opened* on pump P-101 (${a.peakRatio.toFixed(1)}x the alarm level)`;
  const lines = [head, `Recorded time: ${nice(a.start)}`];
  const drivers = a.topSensors.slice(0, 3).map((s) => `${name(s.sensor)} (${Math.round(s.share * 100)}%)`).join(", ");
  if (drivers) lines.push(`Driving the deviation: ${drivers}`);
  if (a.match && a.match.level !== "weak") {
    lines.push(`${a.match.level === "strong" ? "Strong" : "Possible"} match to the ${nice(a.match.failure)} failure (${Math.round(a.match.similarity * 100)}% alike)`);
  }
  // only our own text is escaped; the link must stay as Slack markup
  return [...lines.map(esc), `<${dashboardUrl}|Open the dashboard>`].join("\n");
}

export class Notifier {
  private seen = new Set<string>();
  private recent: number[] = [];
  private st = { sent: 0, dropped: 0, lastError: null as string | null, lastSentAt: null as string | null };
  private f: typeof fetch;
  private now: () => number;

  constructor(private o: NotifyOptions) {
    this.f = o.fetchImpl ?? fetch;
    this.now = o.now ?? Date.now;
  }

  status(): NotifyStatus {
    return { enabled: !!this.o.url, minSeverity: this.o.minSeverity, ...this.st };
  }

  /**
   * Called with every opened or changed alert. An alert is announced once when it opens and once more if it later
   * escalates to critical, so replaying the same history never repeats a message. Alerts raised while the pump is
   * restarting after a recorded failure are expected and are not announced.
   */
  async onAlert(a: Alert): Promise<void> {
    if (!this.o.url || a.recovery || a.status !== "open") return;
    if (this.o.minSeverity === "critical" && a.severity !== "critical") return;
    const opened = `${a.id}:opened`, critical = `${a.id}:critical`;
    let event: "opened" | "critical" | null = null;
    if (!this.seen.has(opened)) {
      this.seen.add(opened);
      if (a.severity === "critical") this.seen.add(critical);
      event = "opened";
    } else if (a.severity === "critical" && !this.seen.has(critical)) {
      this.seen.add(critical);
      event = "critical";
    }
    if (event) await this.send(message(a, event, this.o.dashboardUrl));
  }

  async test(): Promise<void> {
    if (!this.o.url) throw new Error("notifications are not configured");
    await this.post(":white_check_mark: Pump Guardian test message. Notifications are working.");
  }

  private async send(text: string): Promise<void> {
    const t = this.now();
    this.recent = this.recent.filter((x) => t - x < 60_000);
    if (this.recent.length >= this.o.maxPerMinute) { this.st.dropped++; return; }
    this.recent.push(t);
    try { await this.post(text); } catch { /* recorded in lastError; alerting must never depend on Slack being up */ }
  }

  private async post(text: string): Promise<void> {
    try {
      const res = await this.f(this.o.url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`webhook answered ${res.status}`);
      this.st.sent++; this.st.lastError = null; this.st.lastSentAt = new Date(this.now()).toISOString();
    } catch (e) {
      this.st.lastError = (e as Error).message;
      throw e;
    }
  }
}
