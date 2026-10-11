import { RelationshipType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getAncestors, getDescendants, wouldCreateParentCycle } from "../../common/db/ancestry";
import { BadRequestError, NotFoundError } from "../../common/errors/AppError";
import { prisma } from "../../config/prisma";
import type { CreateRelationshipInput, UpdateRelationshipInput } from "./relationships.validation";

/**
 * Open collaboration model: anyone can relate anyone to anyone, regardless
 * of which family(ies) they already belong to (see README). Relating two
 * people under familyId's context makes both of them members of that
 * family if they weren't already, rather than rejecting the relationship -
 * so the family's tree view stays a complete, connected picture instead of
 * silently missing edges to people recorded elsewhere.
 */
async function ensureBothAreMembers(
  tx: Prisma.TransactionClient,
  familyId: string,
  personId: string,
  relatedPersonId: string,
): Promise<void> {
  await tx.familyMembership.createMany({
    data: [
      { familyId, personId },
      { familyId, personId: relatedPersonId },
    ],
    skipDuplicates: true,
  });
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
    await ensureBothAreMembers(tx, familyId, input.personId, input.relatedPersonId);

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

export async function updateRelationship(relationshipId: string, input: UpdateRelationshipInput) {
  await getRelationshipOrThrow(relationshipId);

  return prisma.personRelationship.update({
    where: { id: relationshipId },
    data: { validFrom: input.validFrom, validTo: input.validTo, notes: input.notes },
  });
}

export async function deleteRelationship(relationshipId: string): Promise<void> {
  await getRelationshipOrThrow(relationshipId);

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
