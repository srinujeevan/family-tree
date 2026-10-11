import { z } from "zod";

export const createFamilySchema = z.object({
  familyName: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).optional(),
});
export type CreateFamilyInput = z.infer<typeof createFamilySchema>;

export const updateFamilySchema = z.object({
  familyName: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  // Must be a member of this family - validated in the service, not here.
  rootPersonId: z.string().uuid().nullable().optional(),
});
export type UpdateFamilyInput = z.infer<typeof updateFamilySchema>;

export const listFamiliesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(150).optional(),
});
export type ListFamiliesQuery = z.infer<typeof listFamiliesQuerySchema>;
