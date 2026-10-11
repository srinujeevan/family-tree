-- Hand-written migration: constraints that Prisma's schema language cannot
-- express yet (CHECK constraints and a partial unique index). Keep this file
-- in sync with the invariants documented in prisma/schema.prisma.

-- A person cannot die before they were born (when both dates are known).
ALTER TABLE "persons"
  ADD CONSTRAINT "chk_person_death_after_birth"
  CHECK ("date_of_death" IS NULL OR "date_of_birth" IS NULL OR "date_of_death" >= "date_of_birth");

-- A living person cannot have a date of death recorded.
ALTER TABLE "persons"
  ADD CONSTRAINT "chk_person_living_has_no_death_date"
  CHECK ("is_living" = false OR "date_of_death" IS NULL);

-- A relationship cannot point a person to themselves.
ALTER TABLE "person_relationships"
  ADD CONSTRAINT "chk_relationship_not_self"
  CHECK ("person_id" <> "related_person_id");

-- validTo cannot precede validFrom when both are set.
ALTER TABLE "person_relationships"
  ADD CONSTRAINT "chk_relationship_valid_date_order"
  CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" >= "valid_from");

-- SPOUSE is symmetric. To prevent storing both A-SPOUSE-B and B-SPOUSE-A as
-- separate rows, every SPOUSE edge must be written with person_id < related_person_id
-- (UUIDs compare lexically). The application service layer is responsible for
-- normalizing the pair before insert; this constraint rejects any row that
-- doesn't follow that convention.
ALTER TABLE "person_relationships"
  ADD CONSTRAINT "chk_spouse_canonical_order"
  CHECK ("relationship_type" <> 'SPOUSE' OR "person_id" < "related_person_id");

-- Only one primary photo per person. A plain unique index can't express
-- "unique only among is_primary = true" rows, so this uses a partial index.
CREATE UNIQUE INDEX "uq_person_photos_one_primary"
  ON "person_photos" ("person_id")
  WHERE "is_primary" = true;
