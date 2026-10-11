import type { Request, Response } from "express";
import * as familiesService from "./families.service";
import type { CreateFamilyInput, ListFamiliesQuery, UpdateFamilyInput } from "./families.validation";

export async function createFamily(req: Request<unknown, unknown, CreateFamilyInput>, res: Response): Promise<void> {
  const family = await familiesService.createFamily(req.user!, req.body);
  res.status(201).json({ family });
}

export async function listFamilies(req: Request, res: Response): Promise<void> {
  const query = res.locals.query as ListFamiliesQuery;
  const result = await familiesService.listFamilies(req.user!, query);
  res.json(result);
}

export async function getFamily(req: Request, res: Response): Promise<void> {
  const family = await familiesService.getFamilyById(req.params.familyId as string);
  res.json({ family });
}

export async function updateFamily(req: Request<{ familyId: string }, unknown, UpdateFamilyInput>, res: Response): Promise<void> {
  const family = await familiesService.updateFamily(req.params.familyId, req.body);
  res.json({ family });
}

export async function deleteFamily(req: Request, res: Response): Promise<void> {
  await familiesService.deleteFamily(req.params.familyId as string);
  res.status(204).send();
}
