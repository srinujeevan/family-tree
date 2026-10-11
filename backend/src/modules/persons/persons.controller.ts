import type { Request, Response } from "express";
import { PermissionRole } from "@prisma/client";
import * as personsService from "./persons.service";
import type { CreatePersonInput, ListPersonsQuery, UpdatePersonInput } from "./persons.validation";

export async function createPerson(req: Request<{ familyId: string }, unknown, CreatePersonInput>, res: Response): Promise<void> {
  const person = await personsService.createPerson(req.user!, req.params.familyId, req.body);
  res.status(201).json({ person });
}

export async function listPersonsInFamily(req: Request<{ familyId: string }>, res: Response): Promise<void> {
  const query = res.locals.query as ListPersonsQuery;
  const result = await personsService.listPersonsInFamily(req.params.familyId, query);
  res.json(result);
}

export async function getPerson(req: Request, res: Response): Promise<void> {
  const personId = req.params.id as string;
  await personsService.requireEffectiveRole(req.user!.id, personId, PermissionRole.VIEWER);
  const person = await personsService.getPersonById(personId);
  res.json({ person });
}

export async function updatePerson(req: Request<{ id: string }, unknown, UpdatePersonInput>, res: Response): Promise<void> {
  await personsService.requireEffectiveRole(req.user!.id, req.params.id, PermissionRole.EDITOR);
  const person = await personsService.updatePerson(req.params.id, req.body);
  res.json({ person });
}

export async function deletePerson(req: Request<{ id: string }>, res: Response): Promise<void> {
  await personsService.requireEffectiveRole(req.user!.id, req.params.id, PermissionRole.EDITOR);
  await personsService.deletePerson(req.params.id);
  res.status(204).send();
}
