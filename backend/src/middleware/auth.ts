import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../common/errors/AppError";
import { verifyAccessToken } from "../common/utils/jwt";

/** Requires a valid `Authorization: Bearer <token>` header; attaches req.user. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}
