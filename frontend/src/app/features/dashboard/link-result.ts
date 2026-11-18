import { CreateRelationshipResponse, FamilyAddition } from '../../core/services/relationships-api.service';

/**
 * What the Add person / Add relation dialogs close with, so the tree view can
 * show an UNDO bar that reverses exactly what the action did.
 */
export interface LinkResult {
  /** Snackbar text, e.g. "Linked Ravi. Added 5 people to this family." */
  message: string;
  undo: {
    relationshipIds: string[];
    addedPersonIds: string[];
    /** People added to other families (child added to the parent's other families). */
    addedElsewhere: FamilyAddition[];
    /** Set by Add person: the person that was created (UNDO deletes them). */
    createdPersonId?: string;
  };
}

/** Flattens one or many create responses (Sibling of creates one per parent). */
export function collectLinkIds(responses: CreateRelationshipResponse | CreateRelationshipResponse[] | null | undefined): {
  relationshipIds: string[];
  addedPersonIds: string[];
  addedElsewhere: FamilyAddition[];
} {
  const list = responses == null ? [] : Array.isArray(responses) ? responses : [responses];
  return {
    relationshipIds: list.map((r) => r.relationship.id),
    addedPersonIds: [...new Set(list.flatMap((r) => r.addedPersonIds ?? []))],
    addedElsewhere: list.flatMap((r) => r.addedElsewhere ?? []),
  };
}

/** " Also added to Vemula Family and Ganala." - or '' when nothing was added elsewhere. */
export function alsoAddedText(familyNames: string[]): string {
  if (familyNames.length === 0) return '';
  const list =
    familyNames.length === 1
      ? familyNames[0]
      : `${familyNames.slice(0, -1).join(', ')} and ${familyNames[familyNames.length - 1]}`;
  return ` Also added to ${list}.`;
}
