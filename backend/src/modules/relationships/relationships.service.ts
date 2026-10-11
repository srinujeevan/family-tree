import { PermissionRole, RelationshipType } from "@prisma/client";
import { getAncestors, getDescendants, wouldCreateParentCycle } from "../../common/db/ancestry";
import { assertFamilyRole } from "../../common/auth/familyPermission";
import { BadRequestError, NotFoundError } from "../../common/errors/AppError";
import { prisma } from "../../config/prisma";
import type { CreateRelationshipInput, UpdateRelationshipInput } from "./relationships.validation";

async function assertBothAreMembers(familyId: string, personId: string, relatedPersonId: string): Promise<void> {
  const memberships = await prisma.familyMembership.findMany({
    where: { familyId, personId: { in: [personId, relatedPersonId] } },
    select: { personId: true },
  });
  const memberIds = new Set(memberships.map((m) => m.personId));
  if (!memberIds.has(personId) || !memberIds.has(relatedPersonId)) {
    throw new BadRequestError("Both people must be members of this family before they can be related");
  }
}

/** SPOUSE is symmetric - always store with personId < relatedPersonId (also enforced by a DB CHECK constraint). */
function canonicalizeIfSpouse(
  relationshipType: RelationshipType,
  personId: string,
  relatedPersonId: string,
): [string, string] {
  if (relationshipType === RelationshipType.SPOUSE && personId > relatedPersonId) {
    return [relatedPersonId, personId];
  }
  return [personId, relatedPersonId];
}

export async function createRelationship(familyId: string, input: CreateRelationshipInput) {
  return prisma.$transaction(async (tx) => {
    await assertBothAreMembers(familyId, input.personId, input.relatedPersonId);

    const [personId, relatedPersonId] = canonicalizeIfSpouse(
      input.relationshipType,
      input.personId,
      input.relatedPersonId,
    );

    if (input.relationshipType === RelationshipType.PARENT) {
      // personId is the proposed parent, relatedPersonId the proposed child.
      if (await wouldCreateParentCycle(tx, familyId, personId, relatedPersonId)) {
        throw new BadRequestError("This would make someone their own ancestor");
      }
    }

    return tx.personRelationship.create({
      data: {
        familyId,
        personId,
        relatedPersonId,
        relationshipType: input.relationshipType,
        validFrom: input.validFrom,
        validTo: input.validTo,
        notes: input.notes,
      },
    });
  });
}

export function listRelationshipsInFamily(familyId: string) {
  return prisma.personRelationship.findMany({
    where: { familyId },
    orderBy: { createdAt: "asc" },
  });
}

async function getRelationshipOrThrow(relationshipId: string) {
  const relationship = await prisma.personRelationship.findUnique({ where: { id: relationshipId } });
  if (!relationship) {
    throw new NotFoundError("Relationship not found");
  }
  return relationship;
}

export async function updateRelationship(caller: { id: string }, relationshipId: string, input: UpdateRelationshipInput) {
  const relationship = await getRelationshipOrThrow(relationshipId);
  await assertFamilyRole(caller.id, relationship.familyId, PermissionRole.EDITOR);

  return prisma.personRelationship.update({
    where: { id: relationshipId },
    data: { validFrom: input.validFrom, validTo: input.validTo, notes: input.notes },
  });
}

export async function deleteRelationship(caller: { id: string }, relationshipId: string): Promise<void> {
  const relationship = await getRelationshipOrThrow(relationshipId);
  await assertFamilyRole(caller.id, relationship.familyId, PermissionRole.EDITOR);

  await prisma.personRelationship.delete({ where: { id: relationshipId } });
}

/**
 * Whole-family graph in one call - all member persons plus every
 * relationship edge between them. Intentionally one query pair, not one
 * request per person, so rendering a tree doesn't fan out into N+1 calls.
 */
export async function getFamilyTree(familyId: string) {
  const [persons, relationships] = await Promise.all([
    prisma.person.findMany({ where: { memberships: { some: { familyId } } } }),
    prisma.personRelationship.findMany({ where: { familyId } }),
  ]);

  return {
    nodes: persons,
    edges: relationships.map((r) => ({
      id: r.id,
      personId: r.personId,
      relatedPersonId: r.relatedPersonId,
      relationshipType: r.relationshipType,
      validFrom: r.validFrom,
      validTo: r.validTo,
    })),
  };
}

async function hydrateWithPersons(entries: { personId: string; depth: number }[]) {
  if (entries.length === 0) {
    return [];
  }
  const persons = await prisma.person.findMany({ where: { id: { in: entries.map((e) => e.personId) } } });
  const byId = new Map(persons.map((p) => [p.id, p]));
  return entries
    .map((e) => {
      const person = byId.get(e.personId);
      return person ? { ...person, depth: e.depth } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

export async function getAncestorsForPerson(familyId: string, personId: string) {
  const entries = await getAncestors(prisma, familyId, personId);
  return hydrateWithPersons(entries);
}

export async function getDescendantsForPerson(familyId: string, personId: string) {
  const entries = await getDescendants(prisma, familyId, personId);
  return hydrateWithPersons(entries);
}
