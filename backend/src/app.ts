import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRateLimiter } from "./middleware/rateLimit";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(pinoHttp({ logger }));
  app.use("/api", apiRateLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Confirms the app can actually reach PostgreSQL - the point of this route
  // is to prove DB connectivity, not just that the process is alive.
  app.get("/api/health/db", async (_req, res) => {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected", latencyMs: Date.now() - start });
  });

  // Feature routes (auth, families, persons, relationships, photos, events,
  // permissions, users) are mounted here in later phases.

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
