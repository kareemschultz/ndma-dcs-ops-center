import { env } from "@ndma-dcs-staff-portal/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "path";

import * as schema from "./schema";

export function createDb() {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();

export async function runMigrations() {
  const migrationsFolder = resolve(import.meta.dirname, "./migrations");
  const migrationDb = drizzle(env.DATABASE_URL);
  await migrate(migrationDb, { migrationsFolder });
}

// Re-export all schema tables, enums, and relations for use in other packages
export * from "./schema";
