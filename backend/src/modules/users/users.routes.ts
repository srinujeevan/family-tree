import { Router } from "express";
import { UserRole } from "@prisma/client";
import { validateBody, validateQuery } from "../../common/validators/validate";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import * as usersController from "./users.controller";
import { createUserSchema, listUsersQuerySchema } from "./users.validation";

export const usersRouter = Router();

usersRouter.use(authenticate);

// Order matters: /me must be registered before the /:id param route.
usersRouter.get("/me", usersController.getOwnProfile);
usersRouter.get("/", validateQuery(listUsersQuerySchema), usersController.listUsers);
usersRouter.get("/:id", usersController.getUserById);
usersRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validateBody(createUserSchema),
  usersController.createUser,
);
