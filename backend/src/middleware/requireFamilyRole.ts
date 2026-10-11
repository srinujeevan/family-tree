import type { NextFunction, Request, Response } from "express";
import { PermissionRole } from "@prisma/client";
import { NotFoundError, UnauthorizedError } from "../common/errors/AppError";
import { prisma } from "../config/prisma";

const ROLE_RANK: Record<PermissionRole, number> = {
  [PermissionRole.VIEWER]: 0,
  [PermissionRole.EDITOR]: 1,
  [PermissionRole.OWNER]: 2,
};

/**
 * Requires at least `minRole` on the family identified by req.params[familyIdParam].
 * Must run after `authenticate`. Attaches req.familyRole on success.
 *
 * Returns 404 (not 403) when the caller lacks any permission on the family,
 * so an unauthorized caller can't tell a private family exists at all.
 */
export function requireFamilyRole(minRole: PermissionRole, familyIdParam = "familyId") {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    const familyId = req.params[familyIdParam] as string | undefined;
    if (!familyId) {
      throw new NotFoundError("Family not found");
    }

    const permission = await prisma.familyUserPermission.findUnique({
      where: { familyId_userId: { familyId, userId: req.user.id } },
    });

    if (!permission || ROLE_RANK[permission.role] < ROLE_RANK[minRole]) {
      throw new NotFoundError("Family not found");
    }

    req.familyRole = permission.role;
    next();
  };
}
