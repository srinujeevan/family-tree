import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Paginated } from '../../shared/models/pagination.model';
import { Gender, Person } from '../../shared/models/person.model';

export interface CreatePersonPayload {
  firstName: string;
  middleName?: string;
  lastName?: string;
  surname?: string;
  displayName?: string;
  gender?: Gender;
  dateOfBirth?: string;
  dateOfDeath?: string;
  isBirthDateApproximate?: boolean;
  placeOfBirth?: string;
  currentCity?: string;
  occupation?: string;
  description?: string;
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

  create(familyId: string, payload: CreatePersonPayload): Observable<{ person: Person }> {
    return this.http.post<{ person: Person }>(`${environment.apiBaseUrl}/families/${familyId}/persons`, payload);
  }
}
