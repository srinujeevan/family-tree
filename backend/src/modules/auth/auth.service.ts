import { UserRole } from "@prisma/client";
import { ConflictError, UnauthorizedError } from "../../common/errors/AppError";
import { toPublicUser } from "../../common/utils/sanitizeUser";
import { comparePassword, hashPassword } from "../../common/utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../common/utils/jwt";
import { prisma } from "../../config/prisma";
import type { LoginInput, RegisterInput } from "./auth.validation";

function issueTokens(user: { id: string; email: string; role: UserRole }) {
  return {
    accessToken: signAccessToken({ sub: user.id, email: user.email, role: user.role }),
    refreshToken: signRefreshToken({ sub: user.id }),
  };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.userAccount.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  // Public registration always creates a USER account. ADMIN/SUPER_ADMIN
  // accounts are only ever provisioned via the protected users module
  // (and SUPER_ADMIN never via any API path at all - see users.service.ts).
  const user = await prisma.userAccount.create({
    data: { fullName: input.fullName, email: input.email, passwordHash, role: UserRole.USER },
  });

  return { user: toPublicUser(user), ...issueTokens(user) };
}

export async function login(input: LoginInput) {
  const user = await prisma.userAccount.findUnique({ where: { email: input.email } });
  if (!user || !user.passwordHash) {
    throw new UnauthorizedError("Invalid email or password");
  }
  if (!user.isActive) {
    throw new UnauthorizedError("This account has been deactivated");
  }

  const valid = await comparePassword(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  return { user: toPublicUser(user), ...issueTokens(user) };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const user = await prisma.userAccount.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw new UnauthorizedError("Account no longer available");
  }

  return issueTokens(user);
}
