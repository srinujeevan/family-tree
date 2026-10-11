import { PermissionRole } from "@prisma/client";
import { NotFoundError } from "../errors/AppError";
import { prisma } from "../../config/prisma";

export const FAMILY_ROLE_RANK: Record<PermissionRole, number> = {
  [PermissionRole.VIEWER]: 0,
  [PermissionRole.EDITOR]: 1,
  [PermissionRole.OWNER]: 2,
};

/**
 * Throws NotFoundError (not Forbidden - see requireFamilyRole) unless the
 * caller holds at least `minRole` on `familyId`. Returns their actual role.
 * Used both by the requireFamilyRole middleware (family in the URL) and by
 * services resolving permission from a non-family-scoped resource, like a
 * relationship or person looked up by its own id.
 */
export async function assertFamilyRole(userId: string, familyId: string, minRole: PermissionRole): Promise<PermissionRole> {
  const permission = await prisma.familyUserPermission.findUnique({
    where: { familyId_userId: { familyId, userId } },
  });
  if (!permission || FAMILY_ROLE_RANK[permission.role] < FAMILY_ROLE_RANK[minRole]) {
    throw new NotFoundError("Family not found");
  }
  return permission.role;
}
