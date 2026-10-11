import { UserRole } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../common/errors/AppError";
import { hashPassword } from "../../common/utils/password";
import { toPublicUser } from "../../common/utils/sanitizeUser";
import { prisma } from "../../config/prisma";
import type { CreateUserInput, ListUsersQuery } from "./users.validation";

type Caller = { id: string; role: UserRole };

/** Roles the caller is allowed to see, per the UserRole permission matrix (see README.md). */
function visibleRolesFor(callerRole: UserRole): UserRole[] {
  switch (callerRole) {
    case UserRole.SUPER_ADMIN:
      return [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER];
    case UserRole.ADMIN:
      return [UserRole.USER];
    case UserRole.USER:
      return [UserRole.USER];
  }
}

export async function createUser(caller: Caller, input: CreateUserInput) {
  // caller.role === USER never reaches here - blocked by requireRole in the route.
  if (caller.role === UserRole.ADMIN && input.role !== UserRole.USER) {
    throw new ForbiddenError("Admins can only create USER accounts");
  }

  const existing = await prisma.userAccount.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.userAccount.create({
    data: { fullName: input.fullName, email: input.email, passwordHash, role: input.role },
  });
  return toPublicUser(user);
}

export async function listUsers(caller: Caller, query: ListUsersQuery) {
  const roles = visibleRolesFor(caller.role);
  const where = {
    role: { in: roles },
    ...(caller.role === UserRole.USER ? { id: { not: caller.id } } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.userAccount.count({ where }),
    prisma.userAccount.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data: users.map(toPublicUser),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getUserById(caller: Caller, id: string) {
  const roles = visibleRolesFor(caller.role);
  const user = await prisma.userAccount.findUnique({ where: { id } });
  const isSelf = user?.id === caller.id;
  // A plain USER sees other USER accounts via this endpoint; use GET /api/users/me for self.
  if (!user || !roles.includes(user.role) || (caller.role === UserRole.USER && isSelf)) {
    throw new NotFoundError("User not found");
  }
  return toPublicUser(user);
}

export async function getOwnProfile(caller: Caller) {
  const user = await prisma.userAccount.findUnique({ where: { id: caller.id } });
  if (!user) {
    throw new NotFoundError("User not found");
  }
  return toPublicUser(user);
}
