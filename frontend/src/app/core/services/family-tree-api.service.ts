import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Person } from '../../shared/models/person.model';
import { PersonRelationship } from '../../shared/models/relationship.model';

export interface FamilyTreeResponse {
  nodes: Person[];
  edges: PersonRelationship[];
}

export interface AncestryEntry extends Person {
  /** Generations removed: 1 = direct parent, 2 = grandparent, etc. */
  depth: number;
}

@Injectable({ providedIn: 'root' })
export class FamilyTreeApiService {
  private readonly http = inject(HttpClient);

  getTree(familyId: string): Observable<FamilyTreeResponse> {
    return this.http.get<FamilyTreeResponse>(`${environment.apiBaseUrl}/families/${familyId}/tree`);
  }

  getAncestors(familyId: string, personId: string): Observable<{ data: AncestryEntry[] }> {
    return this.http.get<{ data: AncestryEntry[] }>(
      `${environment.apiBaseUrl}/families/${familyId}/ancestors/${personId}`,
    );
  }
}
