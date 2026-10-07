export const config = {
  port: Number(process.env.PORT ?? 4000),
  mlUrl: process.env.ML_URL ?? "http://127.0.0.1:8000",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  demoUser: process.env.DEMO_USER ?? "operator",
  demoPass: process.env.DEMO_PASS ?? "pumps123",
  tickMs: Number(process.env.TICK_MS ?? 1000),
};
