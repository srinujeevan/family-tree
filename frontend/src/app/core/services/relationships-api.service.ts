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
}

export interface CreateRelationshipResponse {
  relationship: PersonRelationship;
  /** People this action added to the family - what UNDO removes again. */
  addedPersonIds: string[];
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

  /** Reverses one link action: removes its relationships and the people it added to this family. */
  undoLink(familyId: string, relationshipIds: string[], addedPersonIds: string[]): Observable<void> {
    return this.http.post<void>(`${environment.apiBaseUrl}/families/${familyId}/relationships/undo`, {
      relationshipIds,
      addedPersonIds,
    });
  }
}
