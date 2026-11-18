import { CreateRelationshipResponse } from '../../core/services/relationships-api.service';

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
    /** Set by Add person: the person that was created (UNDO deletes them). */
    createdPersonId?: string;
  };
}

/** Flattens one or many create responses (Sibling of creates one per parent). */
export function collectLinkIds(responses: CreateRelationshipResponse | CreateRelationshipResponse[] | null | undefined): {
  relationshipIds: string[];
  addedPersonIds: string[];
} {
  const list = responses == null ? [] : Array.isArray(responses) ? responses : [responses];
  return {
    relationshipIds: list.map((r) => r.relationship.id),
    addedPersonIds: [...new Set(list.flatMap((r) => r.addedPersonIds ?? []))],
  };
}
