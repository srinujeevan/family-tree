-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "relationship_type" AS ENUM ('PARENT', 'SPOUSE', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('BIRTH', 'MARRIAGE', 'DEATH', 'GRADUATION', 'MIGRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "permission_role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "user_accounts" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "families" (
    "id" UUID NOT NULL,
    "family_name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "root_person_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "surname" VARCHAR(100),
    "display_name" VARCHAR(200),
    "gender" "gender" NOT NULL DEFAULT 'UNKNOWN',
    "date_of_birth" DATE,
    "date_of_death" DATE,
    "is_birth_date_approximate" BOOLEAN NOT NULL DEFAULT false,
    "place_of_birth" VARCHAR(200),
    "current_city" VARCHAR(200),
    "occupation" VARCHAR(150),
    "description" TEXT,
    "is_living" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_memberships" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "membership_role" VARCHAR(50),
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_relationships" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "related_person_id" UUID NOT NULL,
    "relationship_type" "relationship_type" NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_photos" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "caption" VARCHAR(300),
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_events" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "event_type" "event_type" NOT NULL,
    "event_date" DATE,
    "place" VARCHAR(200),
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_user_permissions" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "permission_role" NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_email_key" ON "user_accounts"("email");

-- CreateIndex
CREATE INDEX "families_created_by_idx" ON "families"("created_by");

-- CreateIndex
CREATE INDEX "families_root_person_id_idx" ON "families"("root_person_id");

-- CreateIndex
CREATE INDEX "persons_last_name_first_name_idx" ON "persons"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "persons_date_of_birth_idx" ON "persons"("date_of_birth");

-- CreateIndex
CREATE INDEX "persons_created_by_idx" ON "persons"("created_by");

-- CreateIndex
CREATE INDEX "family_memberships_person_id_idx" ON "family_memberships"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_memberships_family_id_person_id_key" ON "family_memberships"("family_id", "person_id");

-- CreateIndex
CREATE INDEX "person_relationships_family_id_idx" ON "person_relationships"("family_id");

-- CreateIndex
CREATE INDEX "person_relationships_person_id_idx" ON "person_relationships"("person_id");

-- CreateIndex
CREATE INDEX "person_relationships_related_person_id_idx" ON "person_relationships"("related_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_person_relationship" ON "person_relationships"("family_id", "person_id", "related_person_id", "relationship_type");

-- CreateIndex
CREATE INDEX "person_photos_person_id_idx" ON "person_photos"("person_id");

-- CreateIndex
CREATE INDEX "person_events_person_id_idx" ON "person_events"("person_id");

-- CreateIndex
CREATE INDEX "family_user_permissions_user_id_idx" ON "family_user_permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_user_permissions_family_id_user_id_key" ON "family_user_permissions"("family_id", "user_id");

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_root_person_id_fkey" FOREIGN KEY ("root_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_memberships" ADD CONSTRAINT "family_memberships_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_memberships" ADD CONSTRAINT "family_memberships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_related_person_id_fkey" FOREIGN KEY ("related_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_photos" ADD CONSTRAINT "person_photos_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_events" ADD CONSTRAINT "person_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_user_permissions" ADD CONSTRAINT "family_user_permissions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_user_permissions" ADD CONSTRAINT "family_user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

