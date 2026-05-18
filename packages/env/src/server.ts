import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Coerce common truthy strings ("true", "1", "yes") to a boolean; default false. */
const boolFromEnv = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .optional()
  .transform((v) => v === "true" || v === "1" || v === "yes");

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.string().min(1), // accepts "*" (dev) or a full URL (prod)
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // ── Active Directory / LDAP login ────────────────────────────────────────
    // All optional so the app boots without AD configured. When LDAP_ENABLED is
    // true, the login page shows the "Sign in with Active Directory" button and
    // the /api/ldap/login endpoint becomes active.
    LDAP_ENABLED: boolFromEnv,
    // e.g. "ldap://10.9.0.10:389" or "ldaps://..."
    LDAP_URL: z.string().min(1).optional(),
    // Service-account bind DN — UPN format accepted, e.g. "infrastructure@ndma.gov.gy"
    LDAP_BIND_DN: z.string().min(1).optional(),
    // Password for the service-account bind DN (supplied by NDMA IT).
    LDAP_BIND_PASSWORD: z.string().optional(),
    // Search base, e.g. "DC=ad,DC=egov,DC=gy"
    LDAP_BASE_DN: z.string().min(1).optional(),
    // Search filter with a "%(user)s" placeholder for the submitted username.
    LDAP_SEARCH_FILTER: z.string().min(1).optional().default("(sAMAccountName=%(user)s)"),
    // AD domain, e.g. "ndma.gov.gy" — used to build the user UPN for the verify bind.
    LDAP_DOMAIN: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
