/**
 * E2E auth setup.
 * Signs in multiple seeded dev accounts via the API and writes role-specific
 * Playwright storage states for reuse across tests.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASE_URL = "http://localhost:3002";
const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth");

const ACCOUNTS = [
  { file: "admin.json", email: "admin@ndma.gov", password: "admin1234" },
  { file: "manager.json", email: "sachin.ramsuran@ndma.gov", password: "admin1234" },
  { file: "team-lead.json", email: "nicolai.mahangi@ndma.gov", password: "admin1234" },
  { file: "pa.json", email: "ataybia.williams@ndma.gov", password: "admin1234" },
  { file: "staff.json", email: "kareem.schultz@ndma.gov", password: "admin1234" },
];

fs.mkdirSync(AUTH_DIR, { recursive: true });

const seedResult = spawnSync("bun", ["scripts/seed-e2e-workflow.ts"], {
  cwd: path.dirname(fileURLToPath(import.meta.url)).replace(/\\e2e$/, ""),
  stdio: "inherit",
});

if (seedResult.status !== 0) {
  throw new Error("Failed to seed deterministic E2E workflow data.");
}

async function createState(file: string, email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3001",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${await res.text()}`);
  }

  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookieMatch = setCookie.match(/better-auth\.session_token=([^;]+)/);
  if (!cookieMatch) {
    throw new Error(`No session cookie returned for ${email}`);
  }

  const cookieValue = decodeURIComponent(cookieMatch[1]!);
  const storageState = {
    cookies: [
      {
        name: "better-auth.session_token",
        value: cookieValue,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };

  fs.writeFileSync(path.join(AUTH_DIR, file), JSON.stringify(storageState, null, 2));
  console.log(`created ${file} for ${email}`);
}

for (const account of ACCOUNTS) {
  await createState(account.file, account.email, account.password);
}
