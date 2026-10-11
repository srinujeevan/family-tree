import { Person } from '../../../shared/models/person.model';
import { PersonRelationship } from '../../../shared/models/relationship.model';

export interface LayoutNode {
  person: Person;
  x: number;
  y: number;
  generation: number;
  color: string;
}

export interface LayoutLink {
  kind: 'PARENT' | 'SPOUSE' | 'GUARDIAN';
  path: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  width: number;
  height: number;
}

const NODE_RADIUS = 30;
const COLUMN_SPACING = 150;
const ROW_HEIGHT = 180;
const MARGIN = 80;
const GENERATION_COLORS = ['#4e8fcc', '#6fb46f', '#c75b5b', '#8b6bc7', '#d99a3e', '#4ab3a8'];

/**
 * Lays out a family's persons/relationships as a generation-based tree:
 * row = generation (BFS depth from the oldest known ancestors via PARENT
 * edges), x = left-to-right order within that generation. Spouses are kept
 * adjacent in the same row. This is a simplified Reingold-Tilford-style
 * layout - good enough for family-sized graphs, not crossing-minimal for
 * highly tangled ones.
 */
export function buildTreeLayout(persons: Person[], edges: PersonRelationship[]): TreeLayout {
  const personIds = new Set(persons.map((p) => p.id));
  const parentEdges = edges.filter((e) => e.relationshipType === 'PARENT');
  const spouseEdges = edges.filter((e) => e.relationshipType === 'SPOUSE');

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const e of parentEdges) {
    if (!personIds.has(e.personId) || !personIds.has(e.relatedPersonId)) continue;
    childrenOf.set(e.personId, [...(childrenOf.get(e.personId) ?? []), e.relatedPersonId]);
    parentsOf.set(e.relatedPersonId, [...(parentsOf.get(e.relatedPersonId) ?? []), e.personId]);
  }

  const spouseOf = new Map<string, string[]>();
  for (const e of spouseEdges) {
    if (!personIds.has(e.personId) || !personIds.has(e.relatedPersonId)) continue;
    spouseOf.set(e.personId, [...(spouseOf.get(e.personId) ?? []), e.relatedPersonId]);
    spouseOf.set(e.relatedPersonId, [...(spouseOf.get(e.relatedPersonId) ?? []), e.personId]);
  }

  // Generation depth: start every parentless person at a tentative 0, then
  // propagate parent-chain depths downward (handles multiple parents at
  // different depths). This alone would wrongly pin someone who married in
  // (no recorded parents) to generation 0 instead of their spouse's
  // generation, so a second pass equalizes each spouse pair to the higher
  // of the two depths, repeated until stable (handles spouse-of-spouse
  // chains). Parent-chain depth is the authoritative source for anyone who
  // has parents - spouse equalization only ever raises a parentless
  // person's depth to match their partner's.
  const depth = new Map<string, number>();
  for (const p of persons) {
    if (!parentsOf.has(p.id)) depth.set(p.id, 0);
  }
  for (let pass = 0; pass < persons.length + 1; pass++) {
    let changed = false;
    for (const p of persons) {
      const parents = parentsOf.get(p.id);
      if (!parents) continue;
      const parentDepths = parents.map((id) => depth.get(id)).filter((d): d is number => d !== undefined);
      if (parentDepths.length === 0) continue;
      const candidate = Math.max(...parentDepths) + 1;
      if (depth.get(p.id) !== candidate) {
        depth.set(p.id, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (let pass = 0; pass < persons.length + 1; pass++) {
    let changed = false;
    for (const [personId, spouseIds] of spouseOf) {
      if (parentsOf.has(personId)) continue; // parent-chain depth is authoritative
      const ownDepth = depth.get(personId) ?? 0;
      const maxSpouseDepth = Math.max(ownDepth, ...spouseIds.map((id) => depth.get(id) ?? 0));
      if (maxSpouseDepth !== ownDepth) {
        depth.set(personId, maxSpouseDepth);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Left-to-right ordering within each row: DFS from the shallowest nodes,
  // visiting spouses alongside their partner and children immediately after.
  const order: string[] = [];
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    order.push(id);
    for (const spouseId of spouseOf.get(id) ?? []) {
      if (!visited.has(spouseId)) visit(spouseId);
    }
    for (const childId of childrenOf.get(id) ?? []) {
      visit(childId);
    }
  }
  const roots = persons.filter((p) => depth.get(p.id) === 0).sort((a, b) => a.firstName.localeCompare(b.firstName));
  for (const r of roots) visit(r.id);
  for (const p of persons) visit(p.id); // anything still unvisited (disconnected)

  const rows = new Map<number, string[]>();
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    rows.set(d, [...(rows.get(d) ?? []), id]);
  }

  const maxRowWidth = Math.max(1, ...Array.from(rows.values()).map((row) => row.length));
  const diagramWidth = MARGIN * 2 + (maxRowWidth - 1) * COLUMN_SPACING + NODE_RADIUS * 2;

  const positions = new Map<string, { x: number; y: number }>();
  for (const [generation, ids] of rows) {
    const rowWidth = (ids.length - 1) * COLUMN_SPACING;
    const startX = (diagramWidth - rowWidth) / 2;
    ids.forEach((id, i) => {
      positions.set(id, { x: startX + i * COLUMN_SPACING, y: MARGIN + generation * ROW_HEIGHT });
    });
  }

  const personById = new Map(persons.map((p) => [p.id, p]));
  const nodes: LayoutNode[] = persons.map((p) => {
    const pos = positions.get(p.id) ?? { x: MARGIN, y: MARGIN };
    const generation = depth.get(p.id) ?? 0;
    return { person: p, x: pos.x, y: pos.y, generation, color: GENERATION_COLORS[generation % GENERATION_COLORS.length]! };
  });

  const links: LayoutLink[] = [];
  for (const e of edges) {
    const from = positions.get(e.personId);
    const to = positions.get(e.relatedPersonId);
    if (!from || !to) continue;

    if (e.relationshipType === 'SPOUSE') {
      const y = from.y;
      links.push({
        kind: 'SPOUSE',
        x1: from.x,
        y1: y,
        x2: to.x,
        y2: y,
        path: `M ${from.x} ${y} L ${to.x} ${y}`,
      });
    } else {
      const x1 = from.x;
      const y1 = from.y + NODE_RADIUS;
      const x2 = to.x;
      const y2 = to.y - NODE_RADIUS;
      const midY = (y1 + y2) / 2;
      links.push({
        kind: e.relationshipType,
        x1,
        y1,
        x2,
        y2,
        path: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`,
      });
    }
  }

  const maxGeneration = Math.max(0, ...Array.from(rows.keys()));
  const height = MARGIN * 2 + maxGeneration * ROW_HEIGHT;

  return { nodes, links, width: diagramWidth, height };
}

export { NODE_RADIUS };
