import dotenv from "dotenv";

dotenv.config();

export const config = {
  apiPort: Number(process.env.API_PORT ?? 4000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  appSecret: process.env.APP_SECRET ?? "change-me",
  exportDir: process.env.EXPORT_DIR ?? "/app/exports",
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 7),
  gracefulShutdownTimeoutMs: Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? 10_000)
};
