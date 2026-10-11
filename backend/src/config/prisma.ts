import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and configure it.");
}

const adapter = new PrismaPg({ connectionString });

/** Shared PrismaClient singleton. Import this everywhere instead of constructing a new client. */
export const prisma = new PrismaClient({ adapter });
