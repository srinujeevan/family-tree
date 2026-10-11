import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Family } from '../../shared/models/family.model';
import { Paginated } from '../../shared/models/pagination.model';

export interface CreateFamilyPayload {
  familyName: string;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class FamiliesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/families`;

  list(): Observable<Paginated<Family>> {
    return this.http.get<Paginated<Family>>(this.baseUrl, { params: { pageSize: 100 } });
  }

  create(payload: CreateFamilyPayload): Observable<{ family: Family }> {
    return this.http.post<{ family: Family }>(this.baseUrl, payload);
  }
}
