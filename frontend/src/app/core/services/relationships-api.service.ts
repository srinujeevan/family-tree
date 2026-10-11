import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PersonRelationship, RelationshipType } from '../../shared/models/relationship.model';

export interface CreateRelationshipPayload {
  personId: string;
  relatedPersonId: string;
  relationshipType: RelationshipType;
}

@Injectable({ providedIn: 'root' })
export class RelationshipsApiService {
  private readonly http = inject(HttpClient);

  create(familyId: string, payload: CreateRelationshipPayload): Observable<{ relationship: PersonRelationship }> {
    return this.http.post<{ relationship: PersonRelationship }>(
      `${environment.apiBaseUrl}/families/${familyId}/relationships`,
      payload,
    );
  }
}
