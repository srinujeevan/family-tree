export type RelationshipType = 'PARENT' | 'SPOUSE' | 'GUARDIAN';

export interface PersonRelationship {
  id: string;
  familyId: string;
  personId: string;
  relatedPersonId: string;
  relationshipType: RelationshipType;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
  createdAt: string;
}
