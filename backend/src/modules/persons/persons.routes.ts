import { Router } from "express";
import { PermissionRole } from "@prisma/client";
import { validateBody, validateQuery } from "../../common/validators/validate";
import { authenticate } from "../../middleware/auth";
import { requireFamilyRole } from "../../middleware/requireFamilyRole";
import * as personsController from "./persons.controller";
import { createPersonSchema, listPersonsQuerySchema, updatePersonSchema } from "./persons.validation";

/** Mounted at /api/families/:familyId/persons (requires mergeParams on the parent router). */
export const familyPersonsRouter = Router({ mergeParams: true });
familyPersonsRouter.use(authenticate);
familyPersonsRouter.post(
  "/",
  requireFamilyRole(PermissionRole.EDITOR),
  validateBody(createPersonSchema),
  personsController.createPerson,
);
familyPersonsRouter.get(
  "/",
  requireFamilyRole(PermissionRole.VIEWER),
  validateQuery(listPersonsQuerySchema),
  personsController.listPersonsInFamily,
);

/**
 * Mounted at /api/persons. Not family-scoped in the URL because a person can
 * belong to multiple families - permission is resolved in the service layer
 * from the union of the caller's roles across that person's families.
 */
export const personsRouter = Router();
personsRouter.use(authenticate);
personsRouter.get("/:id", personsController.getPerson);
personsRouter.put("/:id", validateBody(updatePersonSchema), personsController.updatePerson);
personsRouter.delete("/:id", personsController.deletePerson);
