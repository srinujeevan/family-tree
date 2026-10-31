import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Paginated } from '../../shared/models/pagination.model';
import { Gender, Person } from '../../shared/models/person.model';

export interface PersonPayload {
  firstName?: string;
  middleName?: string | null;
  lastName?: string | null;
  surname?: string | null;
  displayName?: string | null;
  gender?: Gender;
  dateOfBirth?: string | null;
  dateOfDeath?: string | null;
  isBirthDateApproximate?: boolean;
  placeOfBirth?: string | null;
  currentCity?: string | null;
  occupation?: string | null;
  description?: string | null;
  isLiving?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PersonsApiService {
  private readonly http = inject(HttpClient);

  listInFamily(familyId: string): Observable<Paginated<Person>> {
    return this.http.get<Paginated<Person>>(`${environment.apiBaseUrl}/families/${familyId}/persons`, {
      params: { pageSize: 100 },
    });
  }

  /**
   * Every person in the system, regardless of family - used by the relation
   * picker. pageSize is capped at 100 server-side (listPersonsQuerySchema) -
   * requesting more than that fails validation with a 422.
   */
  listAll(search?: string): Observable<Paginated<Person>> {
    return this.http.get<Paginated<Person>>(`${environment.apiBaseUrl}/persons`, {
      params: { pageSize: 100, ...(search ? { search } : {}) },
    });
  }

  getById(personId: string): Observable<{ person: Person }> {
    return this.http.get<{ person: Person }>(`${environment.apiBaseUrl}/persons/${personId}`);
  }

  create(familyId: string, payload: PersonPayload): Observable<{ person: Person }> {
    return this.http.post<{ person: Person }>(`${environment.apiBaseUrl}/families/${familyId}/persons`, payload);
  }

  update(personId: string, payload: PersonPayload): Observable<{ person: Person }> {
    return this.http.put<{ person: Person }>(`${environment.apiBaseUrl}/persons/${personId}`, payload);
  }
}
