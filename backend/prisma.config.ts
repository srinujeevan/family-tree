import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

dotenv.config();

// Used only by the Prisma CLI (migrate, studio, db pull/push). The app's
// own PrismaClient instance is configured separately in src/config/prisma.ts
// with an explicit driver adapter, as required by Prisma 7.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "ts-node --transpile-only prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
