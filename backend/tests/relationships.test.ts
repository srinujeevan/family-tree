import { randomUUID } from "node:crypto";
import { RelationshipType, UserRole } from "@prisma/client";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/common/utils/jwt";
import { hashPassword } from "../src/common/utils/password";
import { prisma } from "../src/config/prisma";

const app = createApp();
const userIds: string[] = [];
const familyIds: string[] = [];

async function createOwnerContext() {
  const email = `rel-owner-${randomUUID()}@example.com`;
  const passwordHash = await hashPassword("Sup3rSecret!");
  const user = await prisma.userAccount.create({
    data: { fullName: "Relationship Test Owner", email, passwordHash, role: UserRole.USER },
  });
  userIds.push(user.id);
  const token = signAccessToken({ sub: user.id, email: user.email, role: user.role });

  const familyRes = await request(app)
    .post("/api/families")
    .set("Authorization", `Bearer ${token}`)
    .send({ familyName: `Rel Test Family ${randomUUID()}` });
  const familyId = familyRes.body.family.id as string;
  familyIds.push(familyId);

  async function addPerson(firstName: string) {
    const res = await request(app)
      .post(`/api/families/${familyId}/persons`)
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName, lastName: "Test" });
    return res.body.person.id as string;
  }

  return { token, familyId, addPerson };
}

describe("relationships", () => {
  afterAll(async () => {
    // Persons aren't cascade-deleted with their family (they can belong to
    // others), and UserAccount.createdBy -> Person is onDelete: Restrict, so
    // persons must go before their creator's user account.
    await prisma.person.deleteMany({ where: { createdBy: { in: userIds } } });
    for (const familyId of familyIds) {
      await prisma.family.delete({ where: { id: familyId } }).catch(() => undefined);
    }
    await prisma.userAccount.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("creates a PARENT relationship and both ancestors/descendants reflect it", async () => {
    const { token, familyId, addPerson } = await createOwnerContext();
    const parent = await addPerson("Parent");
    const child = await addPerson("Child");

    const createRes = await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: parent, relatedPersonId: child, relationshipType: RelationshipType.PARENT });
    expect(createRes.status).toBe(201);

    const ancestorsRes = await request(app)
      .get(`/api/families/${familyId}/ancestors/${child}`)
      .set("Authorization", `Bearer ${token}`);
    expect(ancestorsRes.body.data.map((p: { id: string }) => p.id)).toEqual([parent]);

    const descendantsRes = await request(app)
      .get(`/api/families/${familyId}/descendants/${parent}`)
      .set("Authorization", `Bearer ${token}`);
    expect(descendantsRes.body.data.map((p: { id: string }) => p.id)).toEqual([child]);
  });

  it("rejects a PARENT relationship that would create a cycle", async () => {
    const { token, familyId, addPerson } = await createOwnerContext();
    const grandparent = await addPerson("Grandparent");
    const parent = await addPerson("Parent");
    const grandchild = await addPerson("Grandchild");

    await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: grandparent, relatedPersonId: parent, relationshipType: RelationshipType.PARENT });
    await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: parent, relatedPersonId: grandchild, relationshipType: RelationshipType.PARENT });

    // grandchild -> PARENT -> grandparent would make grandparent both an
    // ancestor and a descendant of grandchild.
    const cycleRes = await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: grandchild, relatedPersonId: grandparent, relationshipType: RelationshipType.PARENT });
    expect(cycleRes.status).toBe(400);
  });

  it("stores SPOUSE edges canonically regardless of input order, and rejects the duplicate", async () => {
    const { token, familyId, addPerson } = await createOwnerContext();
    const a = await addPerson("Alex");
    const b = await addPerson("Blair");
    const [lo, hi] = [a, b].sort();

    const firstRes = await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: hi, relatedPersonId: lo, relationshipType: RelationshipType.SPOUSE });
    expect(firstRes.status).toBe(201);
    expect(firstRes.body.relationship.personId).toBe(lo);
    expect(firstRes.body.relationship.relatedPersonId).toBe(hi);

    const duplicateRes = await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: lo, relatedPersonId: hi, relationshipType: RelationshipType.SPOUSE });
    expect(duplicateRes.status).toBe(409);
  });

  it("rejects relating two people when one isn't a member of the family", async () => {
    const { token, familyId, addPerson } = await createOwnerContext();
    const member = await addPerson("Member");
    const other = await createOwnerContext();
    const outsider = await other.addPerson("Outsider");

    const res = await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: member, relatedPersonId: outsider, relationshipType: RelationshipType.GUARDIAN });
    expect(res.status).toBe(400);
  });

  it("GET /tree returns all member nodes and relationship edges in one call", async () => {
    const { token, familyId, addPerson } = await createOwnerContext();
    const a = await addPerson("NodeA");
    const b = await addPerson("NodeB");
    await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: a, relatedPersonId: b, relationshipType: RelationshipType.PARENT });

    const res = await request(app).get(`/api/families/${familyId}/tree`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(2);
    expect(res.body.edges).toHaveLength(1);
  });

  it("updates and deletes a relationship by id", async () => {
    const { token, familyId, addPerson } = await createOwnerContext();
    const a = await addPerson("UpdA");
    const b = await addPerson("UpdB");
    const createRes = await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: a, relatedPersonId: b, relationshipType: RelationshipType.GUARDIAN, notes: "v1" });
    const relationshipId = createRes.body.relationship.id as string;

    const updateRes = await request(app)
      .put(`/api/relationships/${relationshipId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "v2" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.relationship.notes).toBe("v2");

    const deleteRes = await request(app)
      .delete(`/api/relationships/${relationshipId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);
  });
});
