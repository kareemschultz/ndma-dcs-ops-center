/**
 * AD login request handler.
 *
 * Verifies username/password against Active Directory, upserts a matching
 * Better Auth user, and mints a real Better Auth session — returned to the
 * browser as the standard session cookie so the rest of the app (oRPC context,
 * RBAC) works unchanged.
 *
 * Local email+password login is unaffected — this is an *additional* path.
 */

import { db, user as userTable } from "@ndma-dcs-staff-portal/db";
import { eq } from "drizzle-orm";
import { auth } from "./index";
import {
  deriveLdapAccountPassword,
  isLdapEnabled,
  verifyLdapCredentials,
} from "./ldap";

export type LdapLoginOutcome = {
  /** HTTP status to return to the browser */
  status: number;
  /** JSON body to return */
  body: { success: boolean; error?: string };
  /** Set-Cookie headers from Better Auth's sign-in response (session cookie) */
  setCookies: string[];
};

/**
 * Handle an AD login attempt.
 *
 * @param request the incoming Request (used so Better Auth sees the right headers)
 * @param username submitted AD username (sAMAccountName or UPN)
 * @param password submitted password
 */
export async function handleLdapLogin(
  request: Request,
  username: string,
  password: string,
): Promise<LdapLoginOutcome> {
  if (!isLdapEnabled()) {
    return {
      status: 404,
      body: { success: false, error: "Active Directory login is not enabled." },
      setCookies: [],
    };
  }

  // 1. Verify the credentials against AD.
  const result = await verifyLdapCredentials(username, password);
  if (!result.ok) {
    return {
      status: 401,
      body: { success: false, error: result.error },
      setCookies: [],
    };
  }

  const { email, name } = result.user;
  const internalPassword = await deriveLdapAccountPassword(email);

  // 2. Upsert the Better Auth user. AD users get the "staff" role by default;
  //    an admin can elevate them afterwards via the Access UI.
  try {
    const existing = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (existing.length === 0) {
      // Create through Better Auth so an `account` row + password hash exist.
      // Called WITHOUT headers → Better Auth treats it as a trusted server
      // call and skips the admin-permission check.
      await auth.api.createUser({
        body: {
          email,
          name,
          password: internalPassword,
          role: "staff",
        },
      });
    } else {
      // Existing user — sync the AD-derived password so the sign-in below
      // succeeds. AD is the source of truth for these accounts. We update the
      // credential hash directly via the Better Auth internal adapter because
      // the admin set-user-password endpoint requires an admin session, which
      // an unauthenticated AD login does not have.
      const ctx = await auth.$context;
      const hashed = await ctx.password.hash(internalPassword);
      await ctx.internalAdapter.updatePassword(existing[0]!.id, hashed);
      if (name) {
        await db
          .update(userTable)
          .set({ name })
          .where(eq(userTable.id, existing[0]!.id));
      }
    }
  } catch (err) {
    return {
      status: 500,
      body: {
        success: false,
        error:
          err instanceof Error
            ? `Failed to provision account: ${err.message}`
            : "Failed to provision account.",
      },
      setCookies: [],
    };
  }

  // 3. Sign in via Better Auth's standard email flow to mint a session cookie.
  try {
    const signInResponse = await auth.api.signInEmail({
      body: { email, password: internalPassword },
      headers: request.headers,
      asResponse: true,
    });

    const setCookies = signInResponse.headers.getSetCookie?.() ?? [];
    if (signInResponse.ok && setCookies.length > 0) {
      return { status: 200, body: { success: true }, setCookies };
    }
    return {
      status: 500,
      body: { success: false, error: "Session could not be created after AD verification." },
      setCookies,
    };
  } catch (err) {
    return {
      status: 500,
      body: {
        success: false,
        error:
          err instanceof Error
            ? `Sign-in failed: ${err.message}`
            : "Sign-in failed after AD verification.",
      },
      setCookies: [],
    };
  }
}
