import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

import { account, db, user } from "@ndma-dcs-staff-portal/db";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  })) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

const password = "admin1234";
const hash = await hashPassword(password);
const now = new Date();

const accounts = [
  { id: "user-admin", name: "Admin User", email: "admin@ndma.gov", role: "admin" },
  { id: "user-sachin", name: "Sachin Ramsuran", email: "sachin.ramsuran@ndma.gov", role: "manager" },
  { id: "user-ataybia", name: "Ataybia Williams", email: "ataybia.williams@ndma.gov", role: "personalAssistant" },
  { id: "user-nicolai", name: "Nicolai Mahangi", email: "nicolai.mahangi@ndma.gov", role: "teamLead" },
  { id: "user-kareem", name: "Kareem Schultz", email: "kareem.schultz@ndma.gov", role: "staff" },
  { id: "user-shemar", name: "Shemar Henry", email: "shemar.henry@ndma.gov", role: "staff" },
  { id: "user-timothy", name: "Timothy Paul", email: "timothy.paul@ndma.gov", role: "staff" },
  { id: "user-devon", name: "Devon Abrams", email: "devon.abrams@ndma.gov", role: "teamLead" },
  { id: "user-bheesham", name: "Bheesham Ramrattan", email: "bheesham.ramrattan@ndma.gov", role: "staff" },
  { id: "user-gerard", name: "Gerard Budhan", email: "gerard.budhan@ndma.gov", role: "teamLead" },
  { id: "user-richie", name: "Richie Goring", email: "richie.goring@ndma.gov", role: "staff" },
  { id: "user-johnatan", name: "Johnathan Sukhlall", email: "johnathan.sukhlall@ndma.gov", role: "staff" },
] as const;

for (const entry of accounts) {
  await db
    .insert(user)
    .values({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      emailVerified: true,
      role: entry.role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: user.id,
      set: {
        name: entry.name,
        email: entry.email,
        emailVerified: true,
        role: entry.role,
        updatedAt: now,
      },
    });

  await db
    .insert(account)
    .values({
      id: `acct-${entry.id}`,
      userId: entry.id,
      accountId: entry.id,
      providerId: "credential",
      password: hash,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: account.id,
      set: {
        accountId: entry.id,
        providerId: "credential",
        password: hash,
        updatedAt: now,
      },
    });
}

console.log(`Seeded credential accounts with password: ${password}`);
