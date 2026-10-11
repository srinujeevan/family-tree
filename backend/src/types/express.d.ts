import type { PermissionRole, UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
      /** Set by requireFamilyRole once it has resolved the caller's role on req.params.familyId. */
      familyRole?: PermissionRole;
    }
  }
}

export {};
