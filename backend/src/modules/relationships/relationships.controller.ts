import type { Request, Response } from "express";
import * as relationshipsService from "./relationships.service";
import type { CreateRelationshipInput, UpdateRelationshipInput } from "./relationships.validation";

export async function createRelationship(
  req: Request<{ familyId: string }, unknown, CreateRelationshipInput>,
  res: Response,
): Promise<void> {
  const relationship = await relationshipsService.createRelationship(req.params.familyId, req.body);
  res.status(201).json({ relationship });
}

export async function listRelationships(req: Request<{ familyId: string }>, res: Response): Promise<void> {
  const relationships = await relationshipsService.listRelationshipsInFamily(req.params.familyId);
  res.json({ data: relationships });
}

export async function updateRelationship(
  req: Request<{ relationshipId: string }, unknown, UpdateRelationshipInput>,
  res: Response,
): Promise<void> {
  const relationship = await relationshipsService.updateRelationship(req.params.relationshipId, req.body);
  res.json({ relationship });
}

export async function deleteRelationship(req: Request<{ relationshipId: string }>, res: Response): Promise<void> {
  await relationshipsService.deleteRelationship(req.params.relationshipId);
  res.status(204).send();
}

export async function getFamilyTree(req: Request<{ familyId: string }>, res: Response): Promise<void> {
  const tree = await relationshipsService.getFamilyTree(req.params.familyId);
  res.json(tree);
}

export async function getAncestors(req: Request<{ familyId: string; personId: string }>, res: Response): Promise<void> {
  const ancestors = await relationshipsService.getAncestorsForPerson(req.params.familyId, req.params.personId);
  res.json({ data: ancestors });
}

export async function getDescendants(req: Request<{ familyId: string; personId: string }>, res: Response): Promise<void> {
  const descendants = await relationshipsService.getDescendantsForPerson(req.params.familyId, req.params.personId);
  res.json({ data: descendants });
}
