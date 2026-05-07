/**
 * Standalone migration runner — used in CI/production deploy.
 *
 * Uses drizzle-orm's programmatic migrate() which reads SQL files directly
 * and does NOT invoke drizzle-kit CLI. This avoids the drizzle-kit
 * duplicate-view-name warning caused by appraisal_tracker_view.existing().
 *
 * Usage (from /app/packages/db inside the container):
 *   bun src/migrate.ts
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { resolve } from "path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

// Log the database being used (without password)
try {
  const url = new URL(databaseUrl);
  console.log(
    `[migrate] connecting to: ${url.hostname}:${url.port}${url.pathname}`,
  );
} catch {
  console.log("[migrate] connecting (URL parse failed)");
}

const db = drizzle(databaseUrl);

const migrationsFolder = resolve(import.meta.dirname, "./migrations");
console.log(`[migrate] migrations folder: ${migrationsFolder}`);

try {
  await migrate(db, { migrationsFolder });
  console.log("[migrate] all migrations applied successfully.");
  process.exit(0);
} catch (err: unknown) {
  const e = err as { message?: string; query?: string; position?: string };
  console.error("[migrate] FAILED");
  if (e.message) console.error("  message:", e.message);
  if (e.query) {
    // Print first 500 chars of the failing query
    const q = String(e.query);
    console.error(
      "  query (first 500 chars):",
      q.length > 500 ? q.slice(0, 500) + "..." : q,
    );
  }
  if (e.position) console.error("  position:", e.position);
  process.exit(1);
}
