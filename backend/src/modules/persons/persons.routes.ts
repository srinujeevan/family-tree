import { Router } from "express";
import { validateBody, validateQuery } from "../../common/validators/validate";
import { authenticate } from "../../middleware/auth";
import * as personsController from "./persons.controller";
import { createPersonSchema, listPersonsQuerySchema, updatePersonSchema } from "./persons.validation";

/**
 * Mounted at /api/families/:familyId/persons (requires mergeParams on the
 * parent router). Any authenticated user may add or list people here - see
 * README "Open collaboration model" for why this isn't role-gated.
 */
export const familyPersonsRouter = Router({ mergeParams: true });
familyPersonsRouter.use(authenticate);
familyPersonsRouter.post("/", validateBody(createPersonSchema), personsController.createPerson);
familyPersonsRouter.get("/", validateQuery(listPersonsQuerySchema), personsController.listPersonsInFamily);

/**
 * Mounted at /api/persons. Not family-scoped in the URL - a person can
 * belong to multiple families, and any authenticated user can view/edit/
 * delete any person (open collaboration model, see README).
 */
export const personsRouter = Router();
personsRouter.use(authenticate);
personsRouter.get("/", validateQuery(listPersonsQuerySchema), personsController.listAllPersons);
personsRouter.get("/:id", personsController.getPerson);
personsRouter.put("/:id", validateBody(updatePersonSchema), personsController.updatePerson);
personsRouter.delete("/:id", personsController.deletePerson);
