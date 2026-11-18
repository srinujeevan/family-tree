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

  it("relates two people across families, auto-adding the outsider as a member instead of rejecting", async () => {
    const { token, familyId, addPerson } = await createOwnerContext();
    const member = await addPerson("Member");
    const other = await createOwnerContext();
    const outsider = await other.addPerson("Outsider");

    const res = await request(app)
      .post(`/api/families/${familyId}/relationships`)
      .set("Authorization", `Bearer ${token}`)
      .send({ personId: member, relatedPersonId: outsider, relationshipType: RelationshipType.GUARDIAN });
    expect(res.status).toBe(201);

    const membership = await prisma.familyMembership.findUnique({
      where: { familyId_personId: { familyId, personId: outsider } },
    });
    expect(membership).not.toBeNull();
  });

  it("linking a couple across families previews, adds and undoes the whole branch below them", async () => {
    // Family 123: ABC with two children; child1 is married (spouse from a
    // third family) and has a grandchild. Family 456: XYZ.
    const f123 = await createOwnerContext();
    const f456 = await createOwnerContext();
    const third = await createOwnerContext();
    const abc = await f123.addPerson("ABC");
    const child1 = await f123.addPerson("Child1");
    const child2 = await f123.addPerson("Child2");
    const grandchild = await f123.addPerson("Grandchild");
    const inLaw = await third.addPerson("InLaw");
    const xyz = await f456.addPerson("XYZ");
    const link = (ctx: typeof f123, body: object) =>
      request(app)
        .post(`/api/families/${ctx.familyId}/relationships`)
        .set("Authorization", `Bearer ${ctx.token}`)
        .send(body);
    await link(f123, { personId: abc, relatedPersonId: child1, relationshipType: RelationshipType.PARENT });
    await link(f123, { personId: abc, relatedPersonId: child2, relationshipType: RelationshipType.PARENT });
    await link(f123, { personId: child1, relatedPersonId: grandchild, relationshipType: RelationshipType.PARENT });
    await link(f123, { personId: child1, relatedPersonId: inLaw, relationshipType: RelationshipType.SPOUSE });

    // Preview from 456: ABC (linked), both children + grandchild (descendants), in-law (spouse). XYZ is already a member.
    const preview = await request(app)
      .post(`/api/families/${f456.familyId}/relationships/preview`)
      .set("Authorization", `Bearer ${f456.token}`)
      .send({ personIds: [xyz, abc] });
    expect(preview.status).toBe(200);
    const byId = Object.fromEntries(preview.body.people.map((p: { id: string; reason: string }) => [p.id, p.reason]));
    expect(byId).toEqual({ [abc]: "linked", [child1]: "descendant", [child2]: "descendant", [grandchild]: "descendant", [inLaw]: "spouse" });

    // Link with relatives: everyone joins 456, and the 123-recorded parent edges are drawn in 456's tree.
    const res = await link(f456, { personId: xyz, relatedPersonId: abc, relationshipType: RelationshipType.SPOUSE, includeRelatives: true });
    expect(res.status).toBe(201);
    expect([...res.body.addedPersonIds].sort()).toEqual([abc, child1, child2, grandchild, inLaw].sort());
    const tree = await request(app).get(`/api/families/${f456.familyId}/tree`).set("Authorization", `Bearer ${f456.token}`);
    expect(tree.body.nodes).toHaveLength(6);
    expect(tree.body.edges).toHaveLength(5); // XYZ-ABC spouse, 3 parent edges, child1-inLaw spouse

    // Undo: the link is gone and 456 is back to just XYZ; nobody was deleted.
    const undo = await request(app)
      .post(`/api/families/${f456.familyId}/relationships/undo`)
      .set("Authorization", `Bearer ${f456.token}`)
      .send({ relationshipIds: [res.body.relationship.id], addedPersonIds: res.body.addedPersonIds });
    expect(undo.status).toBe(204);
    const after = await request(app).get(`/api/families/${f456.familyId}/tree`).set("Authorization", `Bearer ${f456.token}`);
    expect(after.body.nodes.map((n: { id: string }) => n.id)).toEqual([xyz]);
    expect(after.body.edges).toHaveLength(0);
    expect(await prisma.person.count({ where: { id: { in: [abc, child1, child2, grandchild, inLaw] } } })).toBe(5);
  });

  it("adding a child offers the parent's other families, adds the child there when chosen, and undoes it", async () => {
    const famA = await createOwnerContext();
    const famB = await createOwnerContext();
    const dad = await famA.addPerson("Dad");
    const relate = (ctx: typeof famA, body: object) =>
      request(app).post(`/api/families/${ctx.familyId}/relationships`).set("Authorization", `Bearer ${ctx.token}`).send(body);
    // Dad also belongs to family B (e.g. after a marriage link there).
    const bMember = await famB.addPerson("BMember");
    await relate(famB, { personId: bMember, relatedPersonId: dad, relationshipType: RelationshipType.SPOUSE });
    const child = await famA.addPerson("NewChild");

    const preview = await request(app)
      .post(`/api/families/${famA.familyId}/relationships/preview-child-families`)
      .set("Authorization", `Bearer ${famA.token}`)
      .send({ parentId: dad, childId: child });
    expect(preview.status).toBe(200);
    expect(preview.body.families.map((f: { familyId: string }) => f.familyId)).toEqual([famB.familyId]);

    const res = await relate(famA, {
      personId: dad,
      relatedPersonId: child,
      relationshipType: RelationshipType.PARENT,
      alsoAddToFamilyIds: [famB.familyId],
    });
    expect(res.status).toBe(201);
    expect(res.body.addedElsewhere).toEqual([{ familyId: famB.familyId, personIds: [child] }]);
    const treeB = await request(app).get(`/api/families/${famB.familyId}/tree`).set("Authorization", `Bearer ${famB.token}`);
    expect(treeB.body.nodes.map((n: { id: string }) => n.id)).toContain(child);
    expect(treeB.body.edges.some((e: { relatedPersonId: string }) => e.relatedPersonId === child)).toBe(true);

    await request(app)
      .post(`/api/families/${famA.familyId}/relationships/undo`)
      .set("Authorization", `Bearer ${famA.token}`)
      .send({ relationshipIds: [res.body.relationship.id], addedPersonIds: res.body.addedPersonIds, addedElsewhere: res.body.addedElsewhere });
    const afterB = await request(app).get(`/api/families/${famB.familyId}/tree`).set("Authorization", `Bearer ${famB.token}`);
    expect(afterB.body.nodes.map((n: { id: string }) => n.id)).not.toContain(child);
  });

  it("linking without includeRelatives adds only the linked person, as before", async () => {
    const f1 = await createOwnerContext();
    const f2 = await createOwnerContext();
    const parent = await f1.addPerson("Parent");
    const kid = await f1.addPerson("Kid");
    const spouse = await f2.addPerson("Spouse");
    await request(app)
      .post(`/api/families/${f1.familyId}/relationships`)
      .set("Authorization", `Bearer ${f1.token}`)
      .send({ personId: parent, relatedPersonId: kid, relationshipType: RelationshipType.PARENT });

    const res = await request(app)
      .post(`/api/families/${f2.familyId}/relationships`)
      .set("Authorization", `Bearer ${f2.token}`)
      .send({ personId: spouse, relatedPersonId: parent, relationshipType: RelationshipType.SPOUSE });
    expect(res.status).toBe(201);
    expect(res.body.addedPersonIds).toEqual([parent]);
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

  it("open collaboration model: a user with no FamilyUserPermission can still add/edit people and relate across families", async () => {
    const owner = await createOwnerContext();
    const existingPerson = await owner.addPerson("Existing");

    // A second, completely unrelated account - never granted access to owner's family.
    const strangerEmail = `rel-stranger-${randomUUID()}@example.com`;
    const stranger = await prisma.userAccount.create({
      data: { fullName: "Stranger", email: strangerEmail, passwordHash: await hashPassword("Sup3rSecret!"), role: UserRole.USER },
    });
    userIds.push(stranger.id);
    const strangerToken = signAccessToken({ sub: stranger.id, email: stranger.email, role: stranger.role });

    const permission = await prisma.familyUserPermission.findUnique({
      where: { familyId_userId: { familyId: owner.familyId, userId: stranger.id } },
    });
    expect(permission).toBeNull(); // confirms the stranger truly has no granted access

    const createRes = await request(app)
      .post(`/api/families/${owner.familyId}/persons`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ firstName: "AddedByStranger" });
    expect(createRes.status).toBe(201);
    const newPersonId = createRes.body.person.id as string;

    const updateRes = await request(app)
      .put(`/api/persons/${existingPerson}`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ occupation: "Edited by stranger" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.person.occupation).toBe("Edited by stranger");

    const relateRes = await request(app)
      .post(`/api/families/${owner.familyId}/relationships`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ personId: newPersonId, relatedPersonId: existingPerson, relationshipType: RelationshipType.GUARDIAN });
    expect(relateRes.status).toBe(201);
  });

  it("GET /api/persons lists people across different families", async () => {
    const ownerA = await createOwnerContext();
    const ownerB = await createOwnerContext();
    const tag = randomUUID();
    const personA = await ownerA.addPerson(`Global${tag}`);
    const personB = await ownerB.addPerson(`Global${tag}`);

    const res = await request(app)
      .get("/api/persons")
      .query({ search: `Global${tag}`, pageSize: 50 })
      .set("Authorization", `Bearer ${ownerA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining([personA, personB]));
  });
});
