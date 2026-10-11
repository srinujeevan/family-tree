import { Gender } from "@prisma/client";
import { z } from "zod";

const GENDER_VALUES = [Gender.MALE, Gender.FEMALE, Gender.OTHER, Gender.UNKNOWN, Gender.UNDISCLOSED] as const;

// dateOfDeath cannot precede dateOfBirth, when both are present.
function dateOrderIsValid(data: { dateOfBirth?: Date | null; dateOfDeath?: Date | null }): boolean {
  return !data.dateOfBirth || !data.dateOfDeath || data.dateOfDeath >= data.dateOfBirth;
}
// A living person can't also have a dateOfDeath.
function livingStatusIsValid(data: { dateOfDeath?: Date | null; isLiving?: boolean }): boolean {
  return !(data.dateOfDeath && data.isLiving === true);
}

export const createPersonSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    middleName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    surname: z.string().trim().max(100).optional(),
    displayName: z.string().trim().max(200).optional(),
    gender: z.enum(GENDER_VALUES).optional(),
    dateOfBirth: z.coerce.date().optional(),
    dateOfDeath: z.coerce.date().optional(),
    isBirthDateApproximate: z.boolean().optional(),
    placeOfBirth: z.string().trim().max(200).optional(),
    currentCity: z.string().trim().max(200).optional(),
    occupation: z.string().trim().max(150).optional(),
    description: z.string().trim().max(10_000).optional(),
    isLiving: z.boolean().optional(),
  })
  .refine(dateOrderIsValid, { message: "dateOfDeath cannot be before dateOfBirth", path: ["dateOfDeath"] })
  .refine(livingStatusIsValid, { message: "A living person cannot have a dateOfDeath", path: ["isLiving"] });
export type CreatePersonInput = z.infer<typeof createPersonSchema>;

// Partial update: every field optional. Text/date fields accept `null` to
// explicitly clear them; omitting a field leaves it unchanged.
export const updatePersonSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    middleName: z.string().trim().max(100).nullable().optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    surname: z.string().trim().max(100).nullable().optional(),
    displayName: z.string().trim().max(200).nullable().optional(),
    gender: z.enum(GENDER_VALUES).optional(),
    dateOfBirth: z.coerce.date().nullable().optional(),
    dateOfDeath: z.coerce.date().nullable().optional(),
    isBirthDateApproximate: z.boolean().optional(),
    placeOfBirth: z.string().trim().max(200).nullable().optional(),
    currentCity: z.string().trim().max(200).nullable().optional(),
    occupation: z.string().trim().max(150).nullable().optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    isLiving: z.boolean().optional(),
  })
  .refine(dateOrderIsValid, { message: "dateOfDeath cannot be before dateOfBirth", path: ["dateOfDeath"] })
  .refine(livingStatusIsValid, { message: "A living person cannot have a dateOfDeath", path: ["isLiving"] });
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

export const listPersonsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(150).optional(),
  gender: z.enum(GENDER_VALUES).optional(),
  isLiving: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  birthYearFrom: z.coerce.number().int().min(1000).max(3000).optional(),
  birthYearTo: z.coerce.number().int().min(1000).max(3000).optional(),
  sortBy: z.enum(["firstName", "lastName", "dateOfBirth", "createdAt"]).default("firstName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type ListPersonsQuery = z.infer<typeof listPersonsQuerySchema>;
