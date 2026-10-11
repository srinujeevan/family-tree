import { PermissionRole, Prisma } from "@prisma/client";
import { FAMILY_ROLE_RANK } from "../../common/auth/familyPermission";
import { NotFoundError } from "../../common/errors/AppError";
import { prisma } from "../../config/prisma";
import type { CreatePersonInput, ListPersonsQuery, UpdatePersonInput } from "./persons.validation";

/**
 * A person can belong to multiple family trees (see schema notes). Outside
 * the family-scoped routes, a caller's effective permission on a person is
 * the HIGHEST PermissionRole they hold across any family that person
 * belongs to. No overlap at all => null (treated as "not found").
 */
async function getEffectiveRole(callerId: string, personId: string): Promise<PermissionRole | null> {
  const memberships = await prisma.familyMembership.findMany({
    where: { personId },
    select: { familyId: true },
  });
  if (memberships.length === 0) {
    return null;
  }

  const permissions = await prisma.familyUserPermission.findMany({
    where: { userId: callerId, familyId: { in: memberships.map((m) => m.familyId) } },
    select: { role: true },
  });
  if (permissions.length === 0) {
    return null;
  }

  return permissions.reduce<PermissionRole>(
    (best, p) => (FAMILY_ROLE_RANK[p.role] > FAMILY_ROLE_RANK[best] ? p.role : best),
    permissions[0]!.role,
  );
}

export async function requireEffectiveRole(callerId: string, personId: string, minRole: PermissionRole): Promise<void> {
  const role = await getEffectiveRole(callerId, personId);
  if (!role || FAMILY_ROLE_RANK[role] < FAMILY_ROLE_RANK[minRole]) {
    throw new NotFoundError("Person not found");
  }
}

/** isLiving defaults sensibly from dateOfDeath when the caller doesn't say otherwise. */
function inferIsLiving(input: { dateOfDeath?: Date | null; isLiving?: boolean }): boolean | undefined {
  if (input.isLiving !== undefined) {
    return input.isLiving;
  }
  if (input.dateOfDeath) {
    return false;
  }
  return undefined;
}

export async function createPerson(caller: { id: string }, familyId: string, input: CreatePersonInput) {
  const person = await prisma.$transaction(async (tx) => {
    const created = await tx.person.create({
      data: {
        ...input,
        isLiving: inferIsLiving(input) ?? true,
        createdBy: caller.id,
      },
    });
    await tx.familyMembership.create({
      data: { familyId, personId: created.id },
    });
    return created;
  });

  return person;
}

export async function listPersonsInFamily(familyId: string, query: ListPersonsQuery) {
  const where: Prisma.PersonWhereInput = {
    memberships: { some: { familyId } },
    ...(query.gender ? { gender: query.gender } : {}),
    ...(query.isLiving !== undefined ? { isLiving: query.isLiving } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { displayName: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.birthYearFrom || query.birthYearTo
      ? {
          dateOfBirth: {
            ...(query.birthYearFrom ? { gte: new Date(Date.UTC(query.birthYearFrom, 0, 1)) } : {}),
            ...(query.birthYearTo ? { lte: new Date(Date.UTC(query.birthYearTo, 11, 31)) } : {}),
          },
        }
      : {}),
  };

  const [total, persons] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data: persons,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getPersonById(personId: string) {
  const person = await prisma.person.findUniqueOrThrow({
    where: { id: personId },
    include: { memberships: { include: { family: { select: { id: true, familyName: true } } } } },
  });
  const { memberships, ...rest } = person;
  return { ...rest, families: memberships.map((m) => m.family) };
}

export async function updatePerson(personId: string, input: UpdatePersonInput) {
  const person = await prisma.person.update({
    where: { id: personId },
    data: { ...input, isLiving: inferIsLiving(input) },
  });
  return person;
}

export async function deletePerson(personId: string): Promise<void> {
  // Permanently removes the person and - via cascade - their memberships,
  // relationships, photos, and events across EVERY family they belong to.
  // There's no "remove from just this one family" endpoint yet.
  await prisma.person.delete({ where: { id: personId } });
}
