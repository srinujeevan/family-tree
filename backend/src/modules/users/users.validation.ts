import { z } from "zod";
import { UserRole } from "@prisma/client";

// SUPER_ADMIN is deliberately excluded here - no API path can create one.
// See the UserRole permission matrix in schema.prisma / README.md.
export const createUserSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(100),
  role: z.enum([UserRole.ADMIN, UserRole.USER]).default(UserRole.USER),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(150).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
