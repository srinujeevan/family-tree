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

@Injectable({ providedIn: 'root' })
export class FamilyTreeApiService {
  private readonly http = inject(HttpClient);

  getTree(familyId: string): Observable<FamilyTreeResponse> {
    return this.http.get<FamilyTreeResponse>(`${environment.apiBaseUrl}/families/${familyId}/tree`);
  }
}
