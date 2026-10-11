-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- AlterTable
ALTER TABLE "user_accounts" ADD COLUMN     "role" "user_role" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "user_accounts_role_idx" ON "user_accounts"("role");

