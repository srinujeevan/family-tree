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
    // Also add the newly linked person's descendants and their spouses to
    // this family (what the preview listed). Off by default.
    includeRelatives: z.boolean().optional().default(false),
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

export const previewAdditionsSchema = z.object({
  personIds: z.array(z.string().uuid()).min(1).max(10),
});
export type PreviewAdditionsInput = z.infer<typeof previewAdditionsSchema>;

export const undoLinkSchema = z.object({
  relationshipIds: z.array(z.string().uuid()).max(20).default([]),
  addedPersonIds: z.array(z.string().uuid()).max(1000).default([]),
});
export type UndoLinkInput = z.infer<typeof undoLinkSchema>;

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
