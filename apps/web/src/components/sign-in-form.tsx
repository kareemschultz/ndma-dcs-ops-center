// DCS Ops Center login form
// ONE unified sign-in form: a single identifier + password field. The submit
// handler auto-routes between local Better Auth email/password and Active
// Directory (LDAP) without the user choosing a mode.
//   - Identifier with "@"  → try LOCAL first, fall back to AD (if LDAP enabled).
//   - Bare username        → try AD first (if LDAP enabled), fall back to LOCAL.
// Local email+password login (the break-glass admin@ndma.gov account) always
// works — AD is purely additive (CLAUDE.md "Auth Design Rules").
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";
import z from "zod";

import { env } from "@ndma-dcs-staff-portal/env/web";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { authClient } from "@/lib/auth-client";

// Resolve the server origin (same logic as auth-client) so the AD endpoints
// are hit on the Hono server, not the Vite dev origin.
const serverBase =
  env.VITE_SERVER_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

/** Attempt a local Better Auth email+password sign-in. */
async function tryLocalSignIn(
  identifier: string,
  password: string,
): Promise<{ ok: boolean }> {
  const { error } = await authClient.signIn.email({
    email: identifier,
    password,
  });
  return { ok: !error };
}

/** Attempt an Active Directory sign-in via the Hono /api/ldap/login endpoint. */
async function tryAdSignIn(
  identifier: string,
  password: string,
): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`${serverBase}/api/ldap/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username: identifier, password }),
    });
    const data = (await res.json()) as { success: boolean; error?: string };
    return { ok: res.ok && data.success };
  } catch {
    return { ok: false };
  }
}

export default function SignInForm() {
  const navigate = useNavigate();

  // Is Active Directory login enabled on the server? (LDAP_ENABLED env var)
  // Used only to decide whether the AD fallback is even attempted — no UI toggle.
  const ldapStatus = useQuery({
    queryKey: ["ldap-status"],
    queryFn: async (): Promise<{ enabled: boolean }> => {
      const res = await fetch(`${serverBase}/api/ldap/status`);
      if (!res.ok) return { enabled: false };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const ldapEnabled = ldapStatus.data?.enabled ?? false;

  const form = useForm({
    defaultValues: {
      identifier: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const identifier = value.identifier.trim();
      const { password } = value;
      const looksLikeEmail = identifier.includes("@");

      // Decide the order of attempts. The user never picks a mode.
      //  - email-shaped  → local first, then AD
      //  - bare username → AD first, then local
      const attempts: Array<() => Promise<{ ok: boolean }>> = looksLikeEmail
        ? [
            () => tryLocalSignIn(identifier, password),
            ...(ldapEnabled
              ? [() => tryAdSignIn(identifier, password)]
              : []),
          ]
        : [
            ...(ldapEnabled ? [() => tryAdSignIn(identifier, password)] : []),
            () => tryLocalSignIn(identifier, password),
          ];

      for (const attempt of attempts) {
        const { ok } = await attempt();
        if (ok) {
          toast.success("Signed in successfully");
          navigate({ to: "/" });
          return;
        }
      }

      // Never reveal which method matched — one generic error.
      toast.error("Invalid username or password");
    },
    validators: {
      onSubmit: z.object({
        identifier: z.string().trim().min(1, "Username or email is required"),
        password: z.string().min(1, "Password is required"),
      }),
    },
  });

  return (
    <div className="rounded-lg border bg-card p-8 shadow-sm">
      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Shield className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">DCS Ops Center</h1>
        <p className="text-sm text-muted-foreground">NDMA Data Centre Services</p>
      </div>

      {/* One unified sign-in form — auto-routes local vs Active Directory. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="identifier">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={field.name}>Username or email</Label>
              <Input
                id={field.name}
                name={field.name}
                type="text"
                autoComplete="username"
                placeholder="kareem.schultz or you@ndma.gov"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.map((err) => (
                <p key={err?.message} className="text-xs text-destructive">
                  {err?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={field.name}>Password</Label>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.map((err) => (
                <p key={err?.message} className="text-xs text-destructive">
                  {err?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Sign in
            </Button>
          )}
        </form.Subscribe>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Use your NDMA network login or a local account.
      </p>
    </div>
  );
}
