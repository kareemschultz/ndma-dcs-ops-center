/**
 * Standalone migration runner — used in CI/production deploy.
 *
 * Does NOT use drizzle-orm migrate() because that wraps each migration file
 * in a PostgreSQL transaction, which causes "ALTER TYPE ADD VALUE cannot run
 * inside a transaction block" for migrations that add enum values.
 *
 * This runner:
 *   1. Creates the __drizzle_migrations tracking table if missing
 *   2. Reads the journal to get ordered migration tags
 *   3. For each migration not yet applied, splits by statement-breakpoint
 *      and executes each statement individually (no transaction wrapper)
 *   4. Records the migration hash in __drizzle_migrations after success
 *
 * Usage (from /app/packages/db inside the container):
 *   bun src/migrate.ts
 */
import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

try {
  const url = new URL(databaseUrl);
  console.log(
    `[migrate] connecting to: ${url.hostname}:${url.port}${url.pathname}`,
  );
} catch {
  console.log("[migrate] connecting (URL parse failed)");
}

const migrationsFolder = resolve(import.meta.dirname, "./migrations");
console.log(`[migrate] migrations folder: ${migrationsFolder}`);

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  // Ensure migration tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id        serial PRIMARY KEY,
      hash      text    NOT NULL,
      created_at bigint
    )
  `);

  // Read already-applied hashes
  const { rows: applied } = await client.query<{ hash: string }>(
    'SELECT hash FROM "__drizzle_migrations" ORDER BY created_at ASC',
  );
  const appliedHashes = new Set(applied.map((r) => r.hash));

  // Load journal to get canonical ordering
  const journalPath = resolve(migrationsFolder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: Array<{ tag: string; when: number }>;
  };

  let appliedCount = 0;
  let skippedCount = 0;

  for (const entry of journal.entries) {
    const sqlFile = resolve(migrationsFolder, `${entry.tag}.sql`);

    let sql: string;
    try {
      sql = readFileSync(sqlFile, "utf8");
    } catch {
      console.warn(`[migrate] WARNING: SQL file not found for tag ${entry.tag} — skipping`);
      skippedCount++;
      continue;
    }

    // Compute hash the same way drizzle-orm does: sha256 of the file contents
    const hash = createHash("sha256").update(sql).digest("hex");

    if (appliedHashes.has(hash)) {
      console.log(`[migrate] skip  (already applied): ${entry.tag}`);
      skippedCount++;
      continue;
    }

    console.log(`[migrate] apply: ${entry.tag}`);

    // Split on statement-breakpoint markers and execute each individually.
    // No transaction wrapper — this allows ALTER TYPE ADD VALUE to succeed.
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--\n") && s !== "--");

    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      try {
        await client.query(stmt);
      } catch (err: unknown) {
        const e = err as { message?: string; code?: string };
        console.error(`[migrate] FAILED on statement in ${entry.tag}:`);
        console.error(`  message: ${e.message}`);
        console.error(`  code:    ${e.code}`);
        console.error(`  stmt[:300]: ${stmt.slice(0, 300)}`);
        await client.end();
        process.exit(1);
      }
    }

    // Record migration as applied
    await client.query(
      'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
      [hash, entry.when],
    );

    appliedCount++;
  }

  console.log(
    `[migrate] done — ${appliedCount} applied, ${skippedCount} skipped.`,
  );
  await client.end();
  process.exit(0);
} catch (err: unknown) {
  const e = err as { message?: string };
  console.error("[migrate] UNEXPECTED ERROR:", e.message);
  await client.end();
  process.exit(1);
}
