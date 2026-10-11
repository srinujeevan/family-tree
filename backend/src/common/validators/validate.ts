import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

/** Validates req.body against schema, replacing it with the parsed (and coerced) value. */
export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}

/**
 * Validates req.query and stashes the parsed result on res.locals.query.
 * (Express 5 makes req.query effectively read-only, so we don't reassign it.)
 */
export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.locals.query = schema.parse(req.query);
    next();
  };
}
