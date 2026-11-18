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

/** Safety cap so one link can never pull in an unbounded number of people. */
const MAX_RELATIVES = 500;

export type AdditionReason = "linked" | "descendant" | "spouse";

export interface PreviewPerson {
  id: string;
  firstName: string;
  lastName: string | null;
  reason: AdditionReason;
}

/**
 * Who linking `personIds` into `familyId` would bring along. For each of
 * them who isn't a member yet: that person ("linked"), all their descendants
 * through PARENT edges ("descendant"), and the spouses of everyone in that
 * branch ("spouse") - so e.g. marrying ABC (family 123) to XYZ (family 456)
 * from 456 offers ABC's children and grandchildren, with their spouses, so
 * every grandchild shows both parents. Edges recorded in any family count.
 * People already in the family are never listed.
 */
export async function previewAdditions(
  familyId: string,
  personIds: string[],
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PreviewPerson[]> {
  const members = new Set(
    (await client.familyMembership.findMany({ where: { familyId }, select: { personId: true } })).map((m) => m.personId),
  );
  const reasons = new Map<string, AdditionReason>();
  const roots = [...new Set(personIds)].filter((id) => !members.has(id));
  for (const id of roots) {
    reasons.set(id, "linked");
  }

  // Descendants, generation by generation.
  let frontier = roots;
  while (frontier.length > 0 && reasons.size < MAX_RELATIVES) {
    const childEdges = await client.personRelationship.findMany({
      where: { relationshipType: RelationshipType.PARENT, personId: { in: frontier } },
      select: { relatedPersonId: true },
    });
    const next: string[] = [];
    for (const { relatedPersonId } of childEdges) {
      if (!reasons.has(relatedPersonId)) {
        reasons.set(relatedPersonId, "descendant");
        next.push(relatedPersonId);
      }
    }
    frontier = next;
  }

  // Spouses of everyone in the branch (incl. the linked person's own other spouses).
  const branch = [...reasons.keys()];
  if (branch.length > 0) {
    const spouseEdges = await client.personRelationship.findMany({
      where: {
        relationshipType: RelationshipType.SPOUSE,
        OR: [{ personId: { in: branch } }, { relatedPersonId: { in: branch } }],
      },
      select: { personId: true, relatedPersonId: true },
    });
    for (const edge of spouseEdges) {
      for (const id of [edge.personId, edge.relatedPersonId]) {
        if (!reasons.has(id)) {
          reasons.set(id, "spouse");
        }
      }
    }
  }

  const ids = [...reasons.keys()].filter((id) => !members.has(id)).slice(0, MAX_RELATIVES);
  if (ids.length === 0) {
    return [];
  }
  const persons = await client.person.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  const order: Record<AdditionReason, number> = { linked: 0, descendant: 1, spouse: 2 };
  return persons
    .map((p) => ({ ...p, reason: reasons.get(p.id)! }))
    .sort((a, b) => order[a.reason] - order[b.reason] || a.firstName.localeCompare(b.firstName));
}

export interface FamilyAddition {
  familyId: string;
  personIds: string[];
}

export interface ChildFamilyPreview {
  familyId: string;
  familyName: string;
  /** Who would join that family: the child (if they already exist) plus their descendants and spouses. */
  people: PreviewPerson[];
}

/**
 * The other families a child could also be added to when made a child of
 * `parentId`: every family the parent belongs to except `familyId` (and,
 * for an existing child, families they're already in).
 */
export async function previewChildFamilies(
  familyId: string,
  parentId: string,
  childId?: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ChildFamilyPreview[]> {
  const parentFamilies = await client.familyMembership.findMany({
    where: { personId: parentId, familyId: { not: familyId } },
    select: { family: { select: { id: true, familyName: true } } },
  });
  const childFamilyIds = childId
    ? new Set(
        (await client.familyMembership.findMany({ where: { personId: childId }, select: { familyId: true } })).map(
          (m) => m.familyId,
        ),
      )
    : new Set<string>();

  const result: ChildFamilyPreview[] = [];
  for (const { family } of parentFamilies) {
    if (childFamilyIds.has(family.id)) continue;
    const people = childId ? await previewAdditions(family.id, [childId], client) : [];
    result.push({ familyId: family.id, familyName: family.familyName, people });
  }
  return result.sort((a, b) => a.familyName.localeCompare(b.familyName));
}

/**
 * Removes the given people from `familyId` - but only those who still belong
 * to at least one other family, so nobody is ever left without a family.
 */
async function removeMemberships(tx: Prisma.TransactionClient, familyId: string, personIds: string[]): Promise<void> {
  if (personIds.length === 0) return;
  const otherMemberships = await tx.familyMembership.findMany({
    where: { personId: { in: personIds }, familyId: { not: familyId } },
    select: { personId: true },
  });
  const safeToRemove = [...new Set(otherMemberships.map((m) => m.personId))];
  if (safeToRemove.length > 0) {
    await tx.familyMembership.deleteMany({ where: { familyId, personId: { in: safeToRemove } } });
  }
}

/**
 * Reverses one link action (the UNDO bar): deletes the given relationship
 * rows of this family and removes the people that action added - from this
 * family and from any other families it added them to. Nobody is deleted.
 */
export async function undoLink(
  familyId: string,
  relationshipIds: string[],
  addedPersonIds: string[],
  addedElsewhere: FamilyAddition[] = [],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (relationshipIds.length > 0) {
      await tx.personRelationship.deleteMany({ where: { id: { in: relationshipIds }, familyId } });
    }
    // Other families first, so people still count as members here while those are checked.
    for (const addition of addedElsewhere) {
      await removeMemberships(tx, addition.familyId, addition.personIds);
    }
    await removeMemberships(tx, familyId, addedPersonIds);
  });
}

export async function createRelationship(familyId: string, input: CreateRelationshipInput) {
  return prisma.$transaction(async (tx) => {
    // Work out who joins the family BEFORE adding anyone, so the result
    // lists exactly what this action added (that's what UNDO removes).
    const preview = await previewAdditions(familyId, [input.personId, input.relatedPersonId], tx);
    const addedPersonIds = preview.filter((p) => input.includeRelatives || p.reason === "linked").map((p) => p.id);

    await ensureBothAreMembers(tx, familyId, input.personId, input.relatedPersonId);
    if (addedPersonIds.length > 0) {
      await tx.familyMembership.createMany({
        data: addedPersonIds.map((personId) => ({ familyId, personId })),
        skipDuplicates: true,
      });
    }

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

    const relationship = await tx.personRelationship.create({
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

    // PARENT links: also add the child (with their descendants and spouses)
    // to the other families the user ticked in the preview. Only families the
    // parent actually belongs to are honoured.
    const addedElsewhere: FamilyAddition[] = [];
    if (input.relationshipType === RelationshipType.PARENT && input.alsoAddToFamilyIds.length > 0) {
      const allowed = await previewChildFamilies(familyId, personId, relatedPersonId, tx);
      for (const target of allowed.filter((f) => input.alsoAddToFamilyIds.includes(f.familyId))) {
        const personIds = target.people.map((p) => p.id);
        await tx.familyMembership.createMany({
          data: personIds.map((pid) => ({ familyId: target.familyId, personId: pid })),
          skipDuplicates: true,
        });
        addedElsewhere.push({ familyId: target.familyId, personIds });
      }
    }

    return { relationship, addedPersonIds, addedElsewhere };
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
 *
 * Edges are included whichever family they were recorded under, as long as
 * both people are members here - so a couple's children recorded in one
 * spouse's family are drawn connected in the other spouse's family too. The
 * same fact recorded under two families is drawn once.
 */
export async function getFamilyTree(familyId: string) {
  const persons = await prisma.person.findMany({ where: { memberships: { some: { familyId } } } });
  const memberIds = persons.map((p) => p.id);
  const allEdges = await prisma.personRelationship.findMany({
    where: { personId: { in: memberIds }, relatedPersonId: { in: memberIds } },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const relationships = allEdges.filter((r) => {
    const key = `${r.relationshipType}:${r.personId}:${r.relatedPersonId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

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
