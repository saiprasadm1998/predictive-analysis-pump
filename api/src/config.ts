try { process.loadEnvFile(".env"); } catch { /* no .env file: use real environment variables */ }

const prod = process.env.NODE_ENV === "production";
const secret = process.env.JWT_SECRET ?? "dev-only-change-me";
if (prod && secret === "dev-only-change-me") throw new Error("Set JWT_SECRET in production");

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mlUrl: process.env.ML_URL ?? "http://127.0.0.1:8000",
  jwtSecret: secret,
  tickMs: Number(process.env.TICK_MS ?? 1000),
  /** Optional JSON file mapping sensor ids to plant components, e.g. {"sensor_04": "Drive-end bearing"}. */
  sensorMapPath: process.env.SENSOR_MAP ?? "sensor-map.json",
  /** Slack incoming-webhook URL for alert notifications. Empty disables them. */
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
  notifyMinSeverity: process.env.NOTIFY_MIN_SEVERITY === "critical" ? "critical" as const : "warning" as const,
  notifyMaxPerMinute: Number(process.env.NOTIFY_MAX_PER_MINUTE ?? 6),
  /** Where the dashboard lives, for the link in notifications. */
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:5173",
  /** First-run admin account, created only when the users collection is empty. */
  adminUser: process.env.ADMIN_USER ?? process.env.DEMO_USER ?? "operator",
  adminPass: process.env.ADMIN_PASS ?? process.env.DEMO_PASS ?? "pumps123",
};
