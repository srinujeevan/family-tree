import { Router } from "express";
import { PermissionRole } from "@prisma/client";
import { validateBody } from "../../common/validators/validate";
import { authenticate } from "../../middleware/auth";
import { requireFamilyRole } from "../../middleware/requireFamilyRole";
import * as relationshipsController from "./relationships.controller";
import { createRelationshipSchema, updateRelationshipSchema } from "./relationships.validation";

/** Mounted at /api/families/:familyId/relationships (mergeParams via the parent router). */
export const familyRelationshipsRouter = Router({ mergeParams: true });
familyRelationshipsRouter.use(authenticate);
familyRelationshipsRouter.post(
  "/",
  requireFamilyRole(PermissionRole.EDITOR),
  validateBody(createRelationshipSchema),
  relationshipsController.createRelationship,
);
familyRelationshipsRouter.get("/", requireFamilyRole(PermissionRole.VIEWER), relationshipsController.listRelationships);

/** Mounted at /api/families/:familyId (mergeParams via the parent router). */
export const familyTreeRouter = Router({ mergeParams: true });
familyTreeRouter.use(authenticate);
familyTreeRouter.get("/tree", requireFamilyRole(PermissionRole.VIEWER), relationshipsController.getFamilyTree);
familyTreeRouter.get(
  "/ancestors/:personId",
  requireFamilyRole(PermissionRole.VIEWER),
  relationshipsController.getAncestors,
);
familyTreeRouter.get(
  "/descendants/:personId",
  requireFamilyRole(PermissionRole.VIEWER),
  relationshipsController.getDescendants,
);

/**
 * Mounted at /api/relationships. Not family-scoped in the URL; permission is
 * resolved in the service from the relationship's own familyId, same
 * pattern as the standalone /api/persons/:id routes.
 */
export const relationshipsRouter = Router();
relationshipsRouter.use(authenticate);
relationshipsRouter.put("/:relationshipId", validateBody(updateRelationshipSchema), relationshipsController.updateRelationship);
relationshipsRouter.delete("/:relationshipId", relationshipsController.deleteRelationship);
