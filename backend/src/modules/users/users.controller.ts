import type { Request, Response } from "express";
import * as usersService from "./users.service";
import type { CreateUserInput, ListUsersQuery } from "./users.validation";

export async function createUser(req: Request<unknown, unknown, CreateUserInput>, res: Response): Promise<void> {
  const user = await usersService.createUser(req.user!, req.body);
  res.status(201).json({ user });
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const query = res.locals.query as ListUsersQuery;
  const result = await usersService.listUsers(req.user!, query);
  res.json(result);
}

export async function getUserById(req: Request, res: Response): Promise<void> {
  const user = await usersService.getUserById(req.user!, req.params.id as string);
  res.json({ user });
}

export async function getOwnProfile(req: Request, res: Response): Promise<void> {
  const user = await usersService.getOwnProfile(req.user!);
  res.json({ user });
}
