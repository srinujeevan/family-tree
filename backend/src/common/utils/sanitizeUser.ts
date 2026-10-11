import type { UserAccount } from "@prisma/client";

export type PublicUser = Omit<UserAccount, "passwordHash">;

/** Strips passwordHash before a UserAccount ever reaches an API response. */
export function toPublicUser(user: UserAccount): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
