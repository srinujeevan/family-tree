import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/config/prisma";

const app = createApp();

describe("auth", () => {
  const email = `auth-${randomUUID()}@example.com`;
  const password = "Sup3rSecret!";

  afterAll(async () => {
    await prisma.userAccount.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("registers a new account as a USER", async () => {
    const res = await request(app).post("/api/auth/register").send({ fullName: "Auth Test", email, password });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("USER");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toBeTypeOf("string");
  });

  it("rejects duplicate registration", async () => {
    const res = await request(app).post("/api/auth/register").send({ fullName: "Auth Test", email, password });
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^refreshToken=/);
  });

  it("rejects login with the wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("refreshes an access token using the refresh cookie", async () => {
    const loginRes = await request(app).post("/api/auth/login").send({ email, password });
    const cookie = loginRes.headers["set-cookie"];
    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf("string");
  });

  it("rejects refresh with no cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("rejects protected routes without a token", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.status).toBe(401);
  });
});
