import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { CreatePersonInput, ListPersonsQuery, UpdatePersonInput } from "./persons.validation";

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

function buildPersonFilters(query: ListPersonsQuery): Prisma.PersonWhereInput {
  return {
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
}

async function paginatePersons(where: Prisma.PersonWhereInput, query: ListPersonsQuery) {
  const [total, persons] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { memberships: { include: { family: { select: { id: true, familyName: true } } } } },
    }),
  ]);

  return {
    data: persons.map(({ memberships, ...person }) => ({ ...person, families: memberships.map((m) => m.family) })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export function listPersonsInFamily(familyId: string, query: ListPersonsQuery) {
  return paginatePersons({ ...buildPersonFilters(query), memberships: { some: { familyId } } }, query);
}

/**
 * Every person in the system, regardless of family - used by the relation
 * picker, since relating people is no longer restricted to one family (see
 * relationships.service.ts).
 */
export function listAllPersons(query: ListPersonsQuery) {
  return paginatePersons(buildPersonFilters(query), query);
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
