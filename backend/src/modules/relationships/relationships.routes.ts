import { Router } from "express";
import { validateBody } from "../../common/validators/validate";
import { authenticate } from "../../middleware/auth";
import * as relationshipsController from "./relationships.controller";
import {
  createRelationshipSchema,
  previewAdditionsSchema,
  previewChildFamiliesSchema,
  undoLinkSchema,
  updateRelationshipSchema,
} from "./relationships.validation";

/**
 * Mounted at /api/families/:familyId/relationships (mergeParams via the
 * parent router). Open collaboration model: any authenticated user may
 * relate any two people - see README "Open collaboration model".
 */
export const familyRelationshipsRouter = Router({ mergeParams: true });
familyRelationshipsRouter.use(authenticate);
familyRelationshipsRouter.post("/", validateBody(createRelationshipSchema), relationshipsController.createRelationship);
familyRelationshipsRouter.get("/", relationshipsController.listRelationships);
// Who linking these people into the family would also bring along (read-only).
familyRelationshipsRouter.post("/preview", validateBody(previewAdditionsSchema), relationshipsController.previewAdditions);
// Other families of a parent that a new/linked child could also join (read-only).
familyRelationshipsRouter.post(
  "/preview-child-families",
  validateBody(previewChildFamiliesSchema),
  relationshipsController.previewChildFamilies,
);
// Reverses one link action: its relationship rows + the people it added to this family.
familyRelationshipsRouter.post("/undo", validateBody(undoLinkSchema), relationshipsController.undoLink);

/** Mounted at /api/families/:familyId (mergeParams via the parent router). */
export const familyTreeRouter = Router({ mergeParams: true });
familyTreeRouter.use(authenticate);
familyTreeRouter.get("/tree", relationshipsController.getFamilyTree);
familyTreeRouter.get("/ancestors/:personId", relationshipsController.getAncestors);
familyTreeRouter.get("/descendants/:personId", relationshipsController.getDescendants);

/** Mounted at /api/relationships. Not family-scoped in the URL. */
export const relationshipsRouter = Router();
relationshipsRouter.use(authenticate);
relationshipsRouter.put("/:relationshipId", validateBody(updateRelationshipSchema), relationshipsController.updateRelationship);
relationshipsRouter.delete("/:relationshipId", relationshipsController.deleteRelationship);
