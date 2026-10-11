import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  // Never log secrets or full request/response bodies.
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash"],
  ...(env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
    : {}),
});
