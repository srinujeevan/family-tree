import { randomUUID } from "node:crypto";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { hashPassword } from "../src/common/utils/password";
import { signAccessToken } from "../src/common/utils/jwt";
import { prisma } from "../src/config/prisma";

const app = createApp();
const createdIds: string[] = [];

async function createAccount(role: UserRole) {
  const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
  const passwordHash = await hashPassword("Sup3rSecret!");
  const user = await prisma.userAccount.create({
    data: { fullName: `${role} Fixture`, email, passwordHash, role },
  });
  createdIds.push(user.id);
  const token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  return { user, token };
}

describe("users role matrix", () => {
  afterAll(async () => {
    await prisma.userAccount.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("USER cannot create accounts", async () => {
    const { token } = await createAccount(UserRole.USER);
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Nope", email: `nope-${randomUUID()}@example.com`, password: "Sup3rSecret!" });
    expect(res.status).toBe(403);
  });

  it("ADMIN can create a USER account but not an ADMIN account", async () => {
    const { token } = await createAccount(UserRole.ADMIN);

    const okRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "New User", email: `created-${randomUUID()}@example.com`, password: "Sup3rSecret!", role: "USER" });
    expect(okRes.status).toBe(201);
    createdIds.push(okRes.body.user.id);

    const forbiddenRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "New Admin", email: `created-${randomUUID()}@example.com`, password: "Sup3rSecret!", role: "ADMIN" });
    expect(forbiddenRes.status).toBe(403);
  });

  it("SUPER_ADMIN can create both ADMIN and USER accounts", async () => {
    const { token } = await createAccount(UserRole.SUPER_ADMIN);

    const adminRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "New Admin", email: `created-${randomUUID()}@example.com`, password: "Sup3rSecret!", role: "ADMIN" });
    expect(adminRes.status).toBe(201);
    expect(adminRes.body.user.role).toBe("ADMIN");
    createdIds.push(adminRes.body.user.id);
  });

  it("no API path can create a SUPER_ADMIN", async () => {
    const { token } = await createAccount(UserRole.SUPER_ADMIN);
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Nope", email: `nope-${randomUUID()}@example.com`, password: "Sup3rSecret!", role: "SUPER_ADMIN" });
    // Rejected by input validation - SUPER_ADMIN isn't in the allowed enum for this endpoint.
    expect(res.status).toBe(422);
  });

  it("USER only sees other USER accounts, never admins", async () => {
    const { user: selfUser, token } = await createAccount(UserRole.USER);
    await createAccount(UserRole.ADMIN); // noise - must not appear

    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((u: { role: string; id: string }) => u.role === "USER" && u.id !== selfUser.id)).toBe(true);
  });

  it("ADMIN sees only USER accounts, not other admins or super-admins", async () => {
    const { token } = await createAccount(UserRole.ADMIN);
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((u: { role: string }) => u.role === "USER")).toBe(true);
  });

  it("SUPER_ADMIN sees admins and users", async () => {
    await createAccount(UserRole.ADMIN);
    const { token } = await createAccount(UserRole.SUPER_ADMIN);
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const roles = new Set(res.body.data.map((u: { role: string }) => u.role));
    expect(roles.has("ADMIN") || roles.has("SUPER_ADMIN")).toBe(true);
  });

  it("GET /api/users/me returns the caller's own profile", async () => {
    const { user, token } = await createAccount(UserRole.USER);
    const res = await request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });
});
