import { Router } from "express";
import { PermissionRole } from "@prisma/client";
import { validateBody, validateQuery } from "../../common/validators/validate";
import { authenticate } from "../../middleware/auth";
import { requireFamilyRole } from "../../middleware/requireFamilyRole";
import { familyPersonsRouter } from "../persons/persons.routes";
import * as familiesController from "./families.controller";
import { createFamilySchema, listFamiliesQuerySchema, updateFamilySchema } from "./families.validation";

export const familiesRouter = Router();
familiesRouter.use(authenticate);

familiesRouter.post("/", validateBody(createFamilySchema), familiesController.createFamily);
familiesRouter.get("/", validateQuery(listFamiliesQuerySchema), familiesController.listFamilies);
familiesRouter.get("/:familyId", requireFamilyRole(PermissionRole.VIEWER), familiesController.getFamily);
familiesRouter.put(
  "/:familyId",
  requireFamilyRole(PermissionRole.EDITOR),
  validateBody(updateFamilySchema),
  familiesController.updateFamily,
);
familiesRouter.delete("/:familyId", requireFamilyRole(PermissionRole.OWNER), familiesController.deleteFamily);

familiesRouter.use("/:familyId/persons", familyPersonsRouter);
