import { createContext } from "@ndma-dcs-staff-portal/api/context";
import { appRouter } from "@ndma-dcs-staff-portal/api/routers/index";
import { startSyncScheduler } from "@ndma-dcs-staff-portal/api/lib/sync/scheduler";
import { auth } from "@ndma-dcs-staff-portal/auth";
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
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
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

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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
