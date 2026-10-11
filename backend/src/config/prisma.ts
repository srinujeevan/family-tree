import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/** Shared PrismaClient singleton. Import this everywhere instead of constructing a new client. */
export const prisma = new PrismaClient({ adapter });
