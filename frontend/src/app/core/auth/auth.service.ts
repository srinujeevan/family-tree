import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PublicUser } from '../../shared/models/user.model';

interface LoginResponse {
  user: PublicUser;
  accessToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;

  // Access token lives in memory only (never localStorage) - the refresh
  // token is an httpOnly cookie the browser handles on its own.
  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly currentUserSignal = signal<PublicUser | null>(null);

  readonly accessToken = this.accessTokenSignal.asReadonly();
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  login(email: string, password: string): Observable<PublicUser> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, { email, password }, { withCredentials: true })
      .pipe(
        tap((res) => this.setSession(res)),
        map((res) => res.user),
      );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => this.clearSession()),
      catchError(() => {
        // Clear client-side state even if the network call fails.
        this.clearSession();
        return of(void 0);
      }),
    );
  }

  /** Exchanges the httpOnly refresh cookie for a new access token. */
  refresh(): Observable<string> {
    return this.http
      .post<{ accessToken: string }>(`${this.baseUrl}/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((res) => this.accessTokenSignal.set(res.accessToken)),
        map((res) => res.accessToken),
      );
  }

  /**
   * Runs once at app startup (see app.config.ts) to silently restore a
   * session from the refresh cookie after a page reload, since the access
   * token itself doesn't survive one.
   */
  bootstrap(): Promise<void> {
    return firstValueFrom(
      this.refresh().pipe(
        switchMap(() => this.http.get<{ user: PublicUser }>(`${environment.apiBaseUrl}/users/me`)),
        tap((res) => this.currentUserSignal.set(res.user)),
        map(() => void 0),
        catchError(() => {
          this.clearSession();
          return of(void 0);
        }),
      ),
    );
  }

  private setSession(res: LoginResponse): void {
    this.accessTokenSignal.set(res.accessToken);
    this.currentUserSignal.set(res.user);
  }

  private clearSession(): void {
    this.accessTokenSignal.set(null);
    this.currentUserSignal.set(null);
  }
}
