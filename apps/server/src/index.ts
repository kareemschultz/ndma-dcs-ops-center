import { createContext } from "@ndma-dcs-staff-portal/api/context";
import { appRouter } from "@ndma-dcs-staff-portal/api/routers/index";
import { startSyncScheduler } from "@ndma-dcs-staff-portal/api/lib/sync/scheduler";
import { auth } from "@ndma-dcs-staff-portal/auth";
import { handleLdapLogin } from "@ndma-dcs-staff-portal/auth/ldap-login";
import { isLdapEnabled } from "@ndma-dcs-staff-portal/auth/ldap";
import { runMigrations } from "@ndma-dcs-staff-portal/db";
import { env } from "@ndma-dcs-staff-portal/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";

const app = new Hono();

app.use(logger());
// Parse comma-separated allowed origins, e.g. "http://localhost:3001,http://10.6.104.23:3001"
// A single "*" means reflect any origin (dev convenience).
const _allowedOrigins = env.CORS_ORIGIN === "*"
  ? null
  : env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);

app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return _allowedOrigins?.[0] ?? origin;
      if (_allowedOrigins === null) return origin; // reflect all — dev mode
      return _allowedOrigins.includes(origin) ? origin : (_allowedOrigins[0] ?? origin);
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    credentials: true, // required for cookie-based Better Auth sessions
  }),
);

// Security headers on every response
app.use("/*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  );
});

// Better Auth returns its own Response object that bypasses Hono middleware,
// so we must manually inject CORS headers for the auth routes.
app.on(["POST", "GET", "OPTIONS"], "/api/auth/*", async (c) => {
  const origin = c.req.header("origin") ?? "";
  const isAllowed =
    _allowedOrigins === null ||
    (origin !== "" && _allowedOrigins.includes(origin));

  // Handle CORS preflight for auth routes
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": isAllowed && origin ? origin : (_allowedOrigins?.[0] ?? ""),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
        "Vary": "Origin",
      },
    });
  }

  const response = await auth.handler(c.req.raw);

  // Inject CORS headers into Better Auth's response
  if (isAllowed && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }

  return response;
});

// ── Active Directory / LDAP login ──────────────────────────────────────────
// Public endpoint the login page calls to know whether to show the AD button.
app.get("/api/ldap/status", (c) => {
  return c.json({ enabled: isLdapEnabled() });
});

// AD login: verify username/password against Active Directory, upsert a
// Better Auth user, and return the standard session cookie. Local
// email+password login (Better Auth /api/auth/*) is unaffected.
app.post("/api/ldap/login", async (c) => {
  let username = "";
  let password = "";
  try {
    const body = (await c.req.json()) as { username?: string; password?: string };
    username = (body.username ?? "").trim();
    password = body.password ?? "";
  } catch {
    return c.json({ success: false, error: "Invalid request body." }, 400);
  }

  const outcome = await handleLdapLogin(c.req.raw, username, password);

  const headers = new Headers({ "Content-Type": "application/json" });
  for (const cookie of outcome.setCookies) {
    headers.append("Set-Cookie", cookie);
  }
  // Mirror the CORS handling used for /api/auth/* so the browser keeps the cookie.
  const origin = c.req.header("origin") ?? "";
  const isAllowed =
    _allowedOrigins === null || (origin !== "" && _allowedOrigins.includes(origin));
  if (isAllowed && origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  return new Response(JSON.stringify(outcome.body), {
    status: outcome.status,
    headers,
  });
});

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// In production the Hono server also serves the Vite-built SPA.
// The Dockerfile copies apps/web/dist to /app/apps/web/dist; the server
// runs with CWD /app/apps/server, so the relative path is ../web/dist.
if (process.env.NODE_ENV === "production") {
  app.use("/assets/*", serveStatic({ root: "../web/dist" }));
  app.use("/*", serveStatic({ root: "../web/dist" }));
  // SPA fallback — send index.html for all unmatched client-side routes
  app.get("*", serveStatic({ root: "../web/dist", path: "index.html" }));
}

app.get("/", (c) => {
  return c.text("OK");
});

// ── Startup migrations ────────────────────────────────────────────────────
// Run any pending DB migrations before serving traffic. Safe to run on every
// startup — drizzle's migrate() is idempotent and skips already-applied files.
if (process.env.NODE_ENV === "production") {
  try {
    await runMigrations();
    console.log("[startup] migrations OK");
  } catch (err) {
    console.error("[startup] migration failed — aborting", err);
    process.exit(1);
  }
}

// ── Sync scheduler ────────────────────────────────────────────────────────
// Fires on startup and then every 5 minutes, running sync jobs for any
// integration that has syncEnabled + a frequency and is past due.
startSyncScheduler();

export default app;
