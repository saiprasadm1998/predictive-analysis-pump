try { process.loadEnvFile(".env"); } catch { /* no .env file: use real environment variables */ }

const prod = process.env.NODE_ENV === "production";
const secret = process.env.JWT_SECRET ?? "dev-only-change-me";
if (prod && secret === "dev-only-change-me") throw new Error("Set JWT_SECRET in production");

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mlUrl: process.env.ML_URL ?? "http://127.0.0.1:8000",
  jwtSecret: secret,
  tickMs: Number(process.env.TICK_MS ?? 1000),
  /** MongoDB / Atlas connection string. Unset = in-memory store (data lost on restart). */
  mongoUri: process.env.MONGODB_URI ?? "",
  mongoDb: process.env.MONGODB_DB ?? "pump_guardian",
  /** First-run admin account, created only when the users collection is empty. */
  adminUser: process.env.ADMIN_USER ?? process.env.DEMO_USER ?? "operator",
  adminPass: process.env.ADMIN_PASS ?? process.env.DEMO_PASS ?? "pumps123",
};
