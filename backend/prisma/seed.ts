/**
 * Seeds a sample three-generation family so the schema, relationship model,
 * and future API/UI work all have realistic data to exercise immediately.
 *
 * Run with: npm run db:seed (also runs automatically after `prisma migrate reset`).
 */
import { Gender, RelationshipType, EventType, PermissionRole, UserRole, type Person } from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../src/config/prisma';

/** Canonical ordering for symmetric SPOUSE edges: always personId < relatedPersonId. */
function spousePair(a: Person, b: Person): [Person, Person] {
  return a.id < b.id ? [a, b] : [b, a];
}

async function main() {
  const passwordHash = await bcrypt.hash('Passw0rd!2026', 12);

  await prisma.$transaction(
    async (tx) => {
      // Bootstrap account. There is no API endpoint that creates a
      // SUPER_ADMIN (by design, to prevent privilege escalation) - the first
      // one always comes from the seed script or direct DB access.
      const owner = await tx.userAccount.upsert({
        where: { email: 'demo.owner@familytree.local' },
        update: {},
        create: {
          fullName: 'Demo Owner',
          email: 'demo.owner@familytree.local',
          passwordHash,
          isActive: true,
          role: UserRole.SUPER_ADMIN,
        },
      });

      // Demonstrates the rest of the system-role hierarchy (see UserRole in
      // schema.prisma): an ADMIN who can create/view USER accounts, and a
      // plain USER who can only view other USER accounts.
      await tx.userAccount.upsert({
        where: { email: 'demo.admin@familytree.local' },
        update: {},
        create: {
          fullName: 'Demo Admin',
          email: 'demo.admin@familytree.local',
          passwordHash,
          isActive: true,
          role: UserRole.ADMIN,
        },
      });
      await tx.userAccount.upsert({
        where: { email: 'demo.user@familytree.local' },
        update: {},
        create: {
          fullName: 'Demo User',
          email: 'demo.user@familytree.local',
          passwordHash,
          isActive: true,
          role: UserRole.USER,
        },
      });

      const family = await tx.family.create({
        data: {
          familyName: 'The Reddy Family',
          description: 'Sample three-generation family used to exercise the schema.',
          createdBy: owner.id,
        },
      });

      // --- Generation 1 ---------------------------------------------------
      const ramesh = await tx.person.create({
        data: {
          firstName: 'Ramesh',
          lastName: 'Reddy',
          gender: Gender.MALE,
          dateOfBirth: new Date('1948-03-12'),
          placeOfBirth: 'Warangal, India',
          isLiving: false,
          dateOfDeath: new Date('2021-11-02'),
          occupation: 'Farmer',
          createdBy: owner.id,
        },
      });
      const lakshmi = await tx.person.create({
        data: {
          firstName: 'Lakshmi',
          lastName: 'Reddy',
          gender: Gender.FEMALE,
          dateOfBirth: new Date('1952-07-20'),
          placeOfBirth: 'Warangal, India',
          currentCity: 'Hyderabad, India',
          isLiving: true,
          occupation: 'Homemaker',
          createdBy: owner.id,
        },
      });

      // --- Generation 2 ----------------------------------------------------
      const suresh = await tx.person.create({
        data: {
          firstName: 'Suresh',
          lastName: 'Reddy',
          gender: Gender.MALE,
          dateOfBirth: new Date('1975-01-15'),
          currentCity: 'Hyderabad, India',
          occupation: 'Civil Engineer',
          isLiving: true,
          createdBy: owner.id,
        },
      });
      const anitha = await tx.person.create({
        data: {
          firstName: 'Anitha',
          lastName: 'Reddy',
          gender: Gender.FEMALE,
          dateOfBirth: new Date('1978-09-02'),
          currentCity: 'Hyderabad, India',
          occupation: 'Doctor',
          isLiving: true,
          createdBy: owner.id,
        },
      });
      const priya = await tx.person.create({
        data: {
          firstName: 'Priya',
          lastName: 'Reddy',
          displayName: 'Priya Rao',
          gender: Gender.FEMALE,
          dateOfBirth: new Date('1979-04-28'),
          currentCity: 'Bengaluru, India',
          occupation: 'Teacher',
          isLiving: true,
          createdBy: owner.id,
        },
      });
      const vikram = await tx.person.create({
        data: {
          firstName: 'Vikram',
          lastName: 'Rao',
          gender: Gender.MALE,
          dateOfBirth: new Date('1976-12-10'),
          currentCity: 'Bengaluru, India',
          occupation: 'Architect',
          isLiving: true,
          createdBy: owner.id,
        },
      });
      // Included to demonstrate the "former spouse" case (SPOUSE row with
      // validTo set) and multiple-spouse support without a new enum value.
      const meena = await tx.person.create({
        data: {
          firstName: 'Meena',
          lastName: 'Iyer',
          gender: Gender.FEMALE,
          dateOfBirth: new Date('1977-02-18'),
          currentCity: 'Chennai, India',
          isLiving: true,
          description: "Vikram's first spouse; kept to demonstrate former-spouse history.",
          createdBy: owner.id,
        },
      });

      // --- Generation 3 ----------------------------------------------------
      const arjun = await tx.person.create({
        data: {
          firstName: 'Arjun',
          lastName: 'Reddy',
          gender: Gender.MALE,
          dateOfBirth: new Date('2004-06-11'),
          currentCity: 'Hyderabad, India',
          isLiving: true,
          createdBy: owner.id,
        },
      });
      const divya = await tx.person.create({
        data: {
          firstName: 'Divya',
          lastName: 'Reddy',
          gender: Gender.FEMALE,
          dateOfBirth: new Date('2008-10-30'),
          currentCity: 'Hyderabad, India',
          isLiving: true,
          createdBy: owner.id,
        },
      });
      const karthik = await tx.person.create({
        data: {
          firstName: 'Karthik',
          lastName: 'Rao',
          gender: Gender.MALE,
          dateOfBirth: new Date('2010-03-05'),
          currentCity: 'Bengaluru, India',
          isLiving: true,
          createdBy: owner.id,
        },
      });

      const allPersons = [ramesh, lakshmi, suresh, anitha, priya, vikram, meena, arjun, divya, karthik];

      await tx.familyMembership.createMany({
        data: allPersons.map((p) => ({ familyId: family.id, personId: p.id })),
      });

      await tx.family.update({ where: { id: family.id }, data: { rootPersonId: ramesh.id } });

      type RelInput = {
        personId: string;
        relatedPersonId: string;
        relationshipType: RelationshipType;
        validFrom?: Date;
        validTo?: Date;
        notes?: string;
      };
      const relationships: RelInput[] = [];

      // Parents -> children, generation 1 -> 2
      relationships.push(
        { personId: ramesh.id, relatedPersonId: suresh.id, relationshipType: RelationshipType.PARENT },
        { personId: lakshmi.id, relatedPersonId: suresh.id, relationshipType: RelationshipType.PARENT },
        { personId: ramesh.id, relatedPersonId: priya.id, relationshipType: RelationshipType.PARENT },
        { personId: lakshmi.id, relatedPersonId: priya.id, relationshipType: RelationshipType.PARENT },
      );

      // Parents -> children, generation 2 -> 3
      relationships.push(
        { personId: suresh.id, relatedPersonId: arjun.id, relationshipType: RelationshipType.PARENT },
        { personId: anitha.id, relatedPersonId: arjun.id, relationshipType: RelationshipType.PARENT },
        { personId: suresh.id, relatedPersonId: divya.id, relationshipType: RelationshipType.PARENT },
        { personId: anitha.id, relatedPersonId: divya.id, relationshipType: RelationshipType.PARENT },
        { personId: priya.id, relatedPersonId: karthik.id, relationshipType: RelationshipType.PARENT },
        { personId: vikram.id, relatedPersonId: karthik.id, relationshipType: RelationshipType.PARENT },
      );

      // Spouses - always stored with personId < relatedPersonId
      const [rA, rB] = spousePair(ramesh, lakshmi);
      relationships.push({ personId: rA.id, relatedPersonId: rB.id, relationshipType: RelationshipType.SPOUSE, validFrom: new Date('1970-02-10') });

      const [sA, sB] = spousePair(suresh, anitha);
      relationships.push({ personId: sA.id, relatedPersonId: sB.id, relationshipType: RelationshipType.SPOUSE, validFrom: new Date('2002-11-24') });

      const [vA, vB] = spousePair(priya, vikram);
      relationships.push({ personId: vA.id, relatedPersonId: vB.id, relationshipType: RelationshipType.SPOUSE, validFrom: new Date('2003-05-18') });

      const [mA, mB] = spousePair(vikram, meena);
      relationships.push({
        personId: mA.id,
        relatedPersonId: mB.id,
        relationshipType: RelationshipType.SPOUSE,
        validFrom: new Date('1999-01-20'),
        validTo: new Date('2002-08-01'),
        notes: 'Divorced; no children from this marriage.',
      });

      await tx.personRelationship.createMany({
        data: relationships.map((r) => ({ ...r, familyId: family.id })),
      });

      await tx.personEvent.createMany({
        data: [
          { personId: ramesh.id, eventType: EventType.BIRTH, eventDate: ramesh.dateOfBirth!, place: 'Warangal, India' },
          { personId: ramesh.id, eventType: EventType.DEATH, eventDate: ramesh.dateOfDeath!, place: 'Hyderabad, India' },
          { personId: ramesh.id, eventType: EventType.MARRIAGE, eventDate: new Date('1970-02-10'), place: 'Warangal, India', description: 'Married Lakshmi.' },
          { personId: suresh.id, eventType: EventType.MARRIAGE, eventDate: new Date('2002-11-24'), place: 'Hyderabad, India' },
          { personId: karthik.id, eventType: EventType.BIRTH, eventDate: karthik.dateOfBirth!, place: 'Bengaluru, India' },
        ],
      });

      await tx.personPhoto.create({
        data: {
          personId: ramesh.id,
          storageKey: 'seed/placeholder/ramesh-reddy.jpg',
          fileName: 'ramesh-reddy.jpg',
          mimeType: 'image/jpeg',
          isPrimary: true,
          caption: 'Placeholder metadata row - no binary file ships with the seed script.',
        },
      });

      await tx.familyUserPermission.create({
        data: { familyId: family.id, userId: owner.id, role: PermissionRole.OWNER },
      });

      console.log('Seed complete:');
      console.log(`  Family:  ${family.familyName} (${family.id})`);
      console.log(`  Persons: ${allPersons.length}`);
      console.log('  Accounts (all use password: Passw0rd!2026):');
      console.log(`    SUPER_ADMIN: ${owner.email}`);
      console.log('    ADMIN:       demo.admin@familytree.local');
      console.log('    USER:        demo.user@familytree.local');
    },
    { timeout: 20_000 },
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
