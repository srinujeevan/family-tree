import { RelationshipType } from "@prisma/client";
import { z } from "zod";

const RELATIONSHIP_TYPE_VALUES = [RelationshipType.PARENT, RelationshipType.SPOUSE, RelationshipType.GUARDIAN] as const;

export const createRelationshipSchema = z
  .object({
    personId: z.string().uuid(),
    relatedPersonId: z.string().uuid(),
    relationshipType: z.enum(RELATIONSHIP_TYPE_VALUES),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => data.personId !== data.relatedPersonId, {
    message: "personId and relatedPersonId must be different",
    path: ["relatedPersonId"],
  })
  .refine((data) => !data.validFrom || !data.validTo || data.validTo >= data.validFrom, {
    message: "validTo cannot be before validFrom",
    path: ["validTo"],
  });
export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;

// personId/relatedPersonId/relationshipType are immutable after creation -
// redefining an edge means deleting it and creating a new one, not a PUT.
export const updateRelationshipSchema = z
  .object({
    validFrom: z.coerce.date().nullable().optional(),
    validTo: z.coerce.date().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((data) => !data.validFrom || !data.validTo || data.validTo >= data.validFrom, {
    message: "validTo cannot be before validFrom",
    path: ["validTo"],
  });
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;
