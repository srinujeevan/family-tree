import { PermissionRole } from "@prisma/client";
import { BadRequestError } from "../../common/errors/AppError";
import { prisma } from "../../config/prisma";
import type { CreateFamilyInput, ListFamiliesQuery, UpdateFamilyInput } from "./families.validation";

function withMemberCount<T extends { _count: { memberships: number } }>(family: T) {
  const { _count, ...rest } = family;
  return { ...rest, memberCount: _count.memberships };
}

function withMemberCountAndCallerRole<T extends { _count: { memberships: number }; permissions: { role: PermissionRole }[] }>(
  family: T,
) {
  const { _count, permissions, ...rest } = family;
  return { ...rest, memberCount: _count.memberships, callerRole: permissions[0]?.role ?? null };
}

export async function createFamily(caller: { id: string }, input: CreateFamilyInput) {
  const family = await prisma.$transaction(async (tx) => {
    const created = await tx.family.create({
      data: { familyName: input.familyName, description: input.description, createdBy: caller.id },
    });
    // Creator always gets OWNER access to the family they just created.
    await tx.familyUserPermission.create({
      data: { familyId: created.id, userId: caller.id, role: PermissionRole.OWNER },
    });
    return created;
  });

  return { ...family, memberCount: 0, callerRole: PermissionRole.OWNER };
}

export async function listFamilies(caller: { id: string }, query: ListFamiliesQuery) {
  // Deliberately scoped to families the caller has an explicit permission
  // row for - UserRole (ADMIN/SUPER_ADMIN) grants no implicit visibility here.
  const where = {
    permissions: { some: { userId: caller.id } },
    ...(query.search ? { familyName: { contains: query.search, mode: "insensitive" as const } } : {}),
  };

  const [total, families] = await Promise.all([
    prisma.family.count({ where }),
    prisma.family.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        _count: { select: { memberships: true } },
        permissions: { where: { userId: caller.id }, select: { role: true } },
      },
    }),
  ]);

  return {
    data: families.map(withMemberCountAndCallerRole),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

/** Caller's access to `familyId` has already been verified by requireFamilyRole. */
export async function getFamilyById(familyId: string) {
  const family = await prisma.family.findUniqueOrThrow({
    where: { id: familyId },
    include: { _count: { select: { memberships: true } } },
  });
  return withMemberCount(family);
}

export async function updateFamily(familyId: string, input: UpdateFamilyInput) {
  if (input.rootPersonId) {
    const membership = await prisma.familyMembership.findUnique({
      where: { familyId_personId: { familyId, personId: input.rootPersonId } },
    });
    if (!membership) {
      throw new BadRequestError("rootPersonId must already be a member of this family");
    }
  }

  const family = await prisma.family.update({
    where: { id: familyId },
    data: {
      familyName: input.familyName,
      description: input.description,
      rootPersonId: input.rootPersonId,
    },
    include: { _count: { select: { memberships: true } } },
  });
  return withMemberCount(family);
}

export async function deleteFamily(familyId: string): Promise<void> {
  // Cascades: memberships, relationships scoped to this family, and
  // permissions are removed. Person records themselves are NOT deleted -
  // they're independent and may belong to other families.
  await prisma.family.delete({ where: { id: familyId } });
}
