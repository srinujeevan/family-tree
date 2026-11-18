import type { Prisma, PrismaClient } from "@prisma/client";

type Queryable = PrismaClient | Prisma.TransactionClient;

export interface AncestryEntry {
  personId: string;
  /** Generations removed: 1 = direct parent/child, 2 = grandparent/grandchild, etc. */
  depth: number;
}

/**
 * Walks PARENT edges upward from `personId` using a recursive CTE - Prisma's
 * ordinary query API can't express unbounded ancestor traversal. Parameters
 * are passed through Prisma's tagged-template $queryRaw, which binds them
 * safely; nothing here is string-concatenated.
 *
 * Edges recorded in ANY family count: "A is B's parent" is a fact about two
 * people, not about the family it happened to be entered under. That's what
 * lets a couple's children (recorded in one family) show up correctly in the
 * other spouse's family too. `_familyId` is kept for API compatibility.
 */
export async function getAncestors(client: Queryable, _familyId: string, personId: string): Promise<AncestryEntry[]> {
  const rows = await client.$queryRaw<{ ancestor_id: string; depth: number }[]>`
    WITH RECURSIVE ancestor_chain AS (
      SELECT person_id AS ancestor_id, 1 AS depth
      FROM person_relationships
      WHERE relationship_type = 'PARENT'
        AND related_person_id = ${personId}::uuid

      UNION

      SELECT pr.person_id AS ancestor_id, ac.depth + 1
      FROM person_relationships pr
      INNER JOIN ancestor_chain ac ON pr.related_person_id = ac.ancestor_id
      WHERE pr.relationship_type = 'PARENT'
    )
    SELECT ancestor_id, MIN(depth)::int AS depth
    FROM ancestor_chain
    GROUP BY ancestor_id
    ORDER BY depth;
  `;
  return rows.map((r) => ({ personId: r.ancestor_id, depth: r.depth }));
}

/** Same idea as getAncestors (edges from any family), walking PARENT edges downward instead. */
export async function getDescendants(client: Queryable, _familyId: string, personId: string): Promise<AncestryEntry[]> {
  const rows = await client.$queryRaw<{ descendant_id: string; depth: number }[]>`
    WITH RECURSIVE descendant_chain AS (
      SELECT related_person_id AS descendant_id, 1 AS depth
      FROM person_relationships
      WHERE relationship_type = 'PARENT'
        AND person_id = ${personId}::uuid

      UNION

      SELECT pr.related_person_id AS descendant_id, dc.depth + 1
      FROM person_relationships pr
      INNER JOIN descendant_chain dc ON pr.person_id = dc.descendant_id
      WHERE pr.relationship_type = 'PARENT'
    )
    SELECT descendant_id, MIN(depth)::int AS depth
    FROM descendant_chain
    GROUP BY descendant_id
    ORDER BY depth;
  `;
  return rows.map((r) => ({ personId: r.descendant_id, depth: r.depth }));
}

/**
 * True if adding a PARENT edge (parentId -> childId) would create a cycle,
 * i.e. childId is already an ancestor of parentId (so parentId is already a
 * descendant of childId - making parentId the parent of childId would mean
 * childId is both an ancestor AND a descendant of parentId).
 */
export async function wouldCreateParentCycle(
  client: Queryable,
  familyId: string,
  parentId: string,
  childId: string,
): Promise<boolean> {
  if (parentId === childId) {
    return true;
  }
  const ancestors = await getAncestors(client, familyId, parentId);
  return ancestors.some((a) => a.personId === childId);
}
