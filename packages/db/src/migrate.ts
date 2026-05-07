/**
 * Standalone migration runner — used in CI/production deploy.
 *
 * Uses drizzle-orm's programmatic migrate() which reads SQL files directly
 * and does NOT invoke drizzle-kit CLI. This avoids the drizzle-kit
 * duplicate-view-name warning caused by appraisal_tracker_view.existing().
 *
 * Usage (from /app/packages/db inside the container):
 *   bun src/migrate.ts
 *
 * Or from repo root:
 *   cd packages/db && bun src/migrate.ts
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { resolve } from "path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const db = drizzle(databaseUrl);

const migrationsFolder = resolve(import.meta.dirname, "./migrations");
console.log(`[migrate] reading from: ${migrationsFolder}`);

try {
  await migrate(db, { migrationsFolder });
  console.log("[migrate] all migrations applied successfully.");
  process.exit(0);
} catch (err) {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
}
