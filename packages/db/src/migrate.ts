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
  console.error("[migrate] FAILED");
  // Drill into cause chain for the real PostgreSQL error
  let cur: unknown = err;
  let depth = 0;
  while (cur && depth < 5) {
    const e = cur as {
      message?: string;
      query?: string;
      position?: string;
      code?: string;
      severity?: string;
      cause?: unknown;
    };
    const label = depth === 0 ? "error" : `cause[${depth}]`;
    if (e.message) console.error(`  ${label}.message:`, e.message.slice(0, 300));
    if (e.code) console.error(`  ${label}.code:`, e.code);
    if (e.severity) console.error(`  ${label}.severity:`, e.severity);
    if (e.position) console.error(`  ${label}.position:`, e.position);
    if (e.query) {
      const q = String(e.query);
      console.error(`  ${label}.query[:200]:`, q.slice(0, 200));
    }
    cur = e.cause;
    depth++;
    if (!cur) break;
  }
  process.exit(1);
}
