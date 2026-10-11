import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "../common/errors/AppError";

/** Must run after `authenticate`. Rejects callers whose role isn't in the allow-list. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Requires one of role(s): ${roles.join(", ")}`);
    }
    next();
  };
}
