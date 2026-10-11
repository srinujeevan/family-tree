import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Paginated } from '../../shared/models/pagination.model';
import { Person } from '../../shared/models/person.model';

@Injectable({ providedIn: 'root' })
export class PersonsApiService {
  private readonly http = inject(HttpClient);

  listInFamily(familyId: string): Observable<Paginated<Person>> {
    return this.http.get<Paginated<Person>>(`${environment.apiBaseUrl}/families/${familyId}/persons`, {
      params: { pageSize: 100 },
    });
  }
}
