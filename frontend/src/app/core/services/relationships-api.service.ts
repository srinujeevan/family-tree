import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PersonRelationship, RelationshipType } from '../../shared/models/relationship.model';

export interface CreateRelationshipPayload {
  personId: string;
  relatedPersonId: string;
  relationshipType: RelationshipType;
  /** Also add the linked person's descendants and their spouses to this family. */
  includeRelatives?: boolean;
  /** PARENT links: other families of the parent the child should also join. */
  alsoAddToFamilyIds?: string[];
}

export interface FamilyAddition {
  familyId: string;
  personIds: string[];
}

export interface CreateRelationshipResponse {
  relationship: PersonRelationship;
  /** People this action added to the family - what UNDO removes again. */
  addedPersonIds: string[];
  /** People this action added to OTHER families (child added to the parent's other families). */
  addedElsewhere?: FamilyAddition[];
}

export interface ChildFamilyPreview {
  familyId: string;
  familyName: string;
  /** For an existing child: who would join (child + descendants + spouses). Empty for a brand-new child. */
  people: PreviewPerson[];
}

export type AdditionReason = 'linked' | 'descendant' | 'spouse';

export interface PreviewPerson {
  id: string;
  firstName: string;
  lastName: string | null;
  reason: AdditionReason;
}

@Injectable({ providedIn: 'root' })
export class RelationshipsApiService {
  private readonly http = inject(HttpClient);

  create(familyId: string, payload: CreateRelationshipPayload): Observable<CreateRelationshipResponse> {
    return this.http.post<CreateRelationshipResponse>(`${environment.apiBaseUrl}/families/${familyId}/relationships`, payload);
  }

  /** Who linking these people into the family would bring along. Read-only. */
  previewAdditions(familyId: string, personIds: string[]): Observable<{ people: PreviewPerson[] }> {
    return this.http.post<{ people: PreviewPerson[] }>(
      `${environment.apiBaseUrl}/families/${familyId}/relationships/preview`,
      { personIds },
    );
  }

  /** Other families of `parentId` that a child could also be added to. Read-only. */
  previewChildFamilies(familyId: string, parentId: string, childId?: string): Observable<{ families: ChildFamilyPreview[] }> {
    return this.http.post<{ families: ChildFamilyPreview[] }>(
      `${environment.apiBaseUrl}/families/${familyId}/relationships/preview-child-families`,
      { parentId, childId },
    );
  }

  /** Reverses one link action: removes its relationships and the people it added (here and in other families). */
  undoLink(
    familyId: string,
    relationshipIds: string[],
    addedPersonIds: string[],
    addedElsewhere: FamilyAddition[] = [],
  ): Observable<void> {
    return this.http.post<void>(`${environment.apiBaseUrl}/families/${familyId}/relationships/undo`, {
      relationshipIds,
      addedPersonIds,
      addedElsewhere,
    });
  }
}
