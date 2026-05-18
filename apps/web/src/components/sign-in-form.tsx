// DCS Ops Center login form
// Shows both local email/password AND Active Directory (LDAP) options — CLAUDE.md mandate
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Loader2, Building2 } from "lucide-react";
import z from "zod";

import { env } from "@ndma-dcs-staff-portal/env/web";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Separator } from "@ndma-dcs-staff-portal/ui/components/separator";
import { authClient } from "@/lib/auth-client";

// Resolve the server origin (same logic as auth-client) so the AD endpoints
// are hit on the Hono server, not the Vite dev origin.
const serverBase =
  env.VITE_SERVER_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

export default function SignInForm() {
  const navigate = useNavigate();
  const [showAd, setShowAd] = useState(false);

  // Is Active Directory login enabled on the server? (LDAP_ENABLED env var)
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

  // ── Local email + password (always enabled — emergency admin fallback) ──
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess: () => {
            toast.success("Signed in successfully");
            navigate({ to: "/" });
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Invalid credentials");
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Enter a valid email address"),
        password: z.string().min(1, "Password is required"),
      }),
    },
  });

  // ── Active Directory (LDAP) sign-in ──
  const adForm = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const res = await fetch(`${serverBase}/api/ldap/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            username: value.username,
            password: value.password,
          }),
        });
        const data = (await res.json()) as { success: boolean; error?: string };
        if (res.ok && data.success) {
          toast.success("Signed in with Active Directory");
          navigate({ to: "/" });
        } else {
          toast.error(data.error || "Active Directory sign-in failed");
        }
      } catch {
        toast.error("Could not reach the Active Directory login service");
      }
    },
    validators: {
      onSubmit: z.object({
        username: z.string().min(1, "AD username is required"),
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

      {/* Email + Password form — always enabled (CLAUDE.md: emergency fallback) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="email">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={field.name}>Email address</Label>
              <Input
                id={field.name}
                name={field.name}
                type="email"
                autoComplete="email"
                placeholder="you@ndma.gov"
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
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
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

      {/* Active Directory SSO */}
      <div className="my-6 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      {!showAd ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!ldapEnabled}
          onClick={() => setShowAd(true)}
          title={
            ldapEnabled
              ? "Sign in with your NDMA network account"
              : "Active Directory integration is not enabled — contact IT"
          }
        >
          <Building2 className="mr-2 size-4" />
          Sign in with Active Directory
        </Button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            adForm.handleSubmit();
          }}
          className="space-y-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="size-4" />
            Active Directory sign-in
          </p>

          <adForm.Field name="username">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>AD username</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="text"
                  autoComplete="username"
                  placeholder="jdoe"
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
          </adForm.Field>

          <adForm.Field name="password">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={`ad-${field.name}`}>Password</Label>
                <Input
                  id={`ad-${field.name}`}
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
          </adForm.Field>

          <adForm.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setShowAd(false)}
                  disabled={isSubmitting}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Sign in
                </Button>
              </div>
            )}
          </adForm.Subscribe>
        </form>
      )}
    </div>
  );
}
