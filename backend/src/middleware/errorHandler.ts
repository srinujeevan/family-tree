import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../common/errors/AppError";
import { logger } from "../config/logger";

/** Postgres error code for a CHECK constraint violation (e.g. our date-consistency constraints). */
const PG_CHECK_VIOLATION = "23514";

/**
 * With the @prisma/adapter-pg driver (required by Prisma 7), raw Postgres
 * errors that don't have a dedicated Prisma P-code surface as P2039, with
 * the real Postgres error nested under meta.driverAdapterError.cause.
 */
function getUnderlyingPgCode(err: Prisma.PrismaClientKnownRequestError): string | undefined {
  const cause = (err.meta as { driverAdapterError?: { cause?: { code?: string } } } | undefined)?.driverAdapterError
    ?.cause;
  return cause?.code;
}

/** Maps common Prisma/Postgres error codes to clean HTTP responses instead of a raw 500. */
function handlePrismaError(err: Prisma.PrismaClientKnownRequestError, res: Response): boolean {
  switch (err.code) {
    case "P2002": // unique constraint violation
      res.status(409).json({
        error: { code: "CONFLICT", message: "A record with these values already exists", details: err.meta },
      });
      return true;
    case "P2025": // record to update/delete/connect was not found
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
      return true;
    case "P2003": // foreign key constraint violation
      res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Referenced record does not exist", details: err.meta },
      });
      return true;
    case "P2039": // raw DB error without a dedicated Prisma code - check underneath
      if (getUnderlyingPgCode(err) === PG_CHECK_VIOLATION) {
        res.status(422).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "This change would leave the record in an inconsistent state (e.g. a living person with a date of death)",
          },
        });
        return true;
      }
      return false;
    default:
      return false;
  }
}

/** Catches everything, including rejected promises from async route handlers (Express 5). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Validation failed", details: err.flatten() },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && handlePrismaError(err, res)) {
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
}
