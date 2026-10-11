import type { Request, Response } from "express";
import { UnauthorizedError } from "../../common/errors/AppError";
import { env } from "../../config/env";
import * as authService from "./auth.service";
import type { LoginInput, RegisterInput } from "./auth.validation";

const REFRESH_COOKIE_NAME = "refreshToken";
// Scoped to /api/auth so the refresh token never gets sent with ordinary API calls.
const REFRESH_COOKIE_PATH = "/api/auth";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // keep in sync with JWT_REFRESH_EXPIRES_IN default (7d)

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

export async function register(req: Request<unknown, unknown, RegisterInput>, res: Response): Promise<void> {
  const { accessToken, refreshToken, user } = await authService.register(req.body);
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ user, accessToken });
}

export async function login(req: Request<unknown, unknown, LoginInput>, res: Response): Promise<void> {
  const { accessToken, refreshToken, user } = await authService.login(req.body);
  setRefreshCookie(res, refreshToken);
  res.json({ user, accessToken });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw new UnauthorizedError("No refresh token");
  }
  const { accessToken, refreshToken } = await authService.refresh(token);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken });
}

export function logout(_req: Request, res: Response): void {
  // Stateless JWTs: this clears the cookie client-side. The already-issued
  // access token remains valid until it naturally expires (short TTL by
  // design). Server-side revocation would need a token/session store, which
  // is intentionally out of scope for now.
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(204).send();
}
