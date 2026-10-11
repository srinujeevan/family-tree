import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Attaches the in-memory access token to every API request. On a 401 from a
 * non-auth endpoint, tries one silent refresh (using the httpOnly cookie)
 * and retries the original request once before giving up.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isAuthEndpoint = req.url.includes('/auth/');

  const token = auth.accessToken();
  const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !isAuthEndpoint) {
        return auth.refresh().pipe(
          switchMap((newToken) => next(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }))),
          catchError(() => throwError(() => err)),
        );
      }
      return throwError(() => err);
    }),
  );
};
