import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "bun:test";

// ────────────────────────────────────────────────────────────────────────────────
// Static RBAC contract — every router file. Closes Hard Invariant #5.
//
// This is a STATIC ANALYSIS suite (no DB, no runtime). It asserts that for every
// router under packages/api/src/routers/:
//   1. Every mutation procedure uses `requireRole`, not `protectedProcedure` (HI #4).
//   2. Every `requireRole("resource", "action")` call references a valid resource
//      + action from packages/auth/src/index.ts.
//   3. If a router has create/update/delete mutations, it must import or call
//      `logAudit()` somewhere in the file (audit trail rule).
// ────────────────────────────────────────────────────────────────────────────────

describe("Static RBAC contract — all routers (HI #5)", () => {
  const ROUTERS_DIR = path.join(import.meta.dir, "..", "src", "routers");
  const routerFiles = fs
    .readdirSync(ROUTERS_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts");

  const sources = new Map<string, string>();
  for (const f of routerFiles) {
    sources.set(f, fs.readFileSync(path.join(ROUTERS_DIR, f), "utf-8"));
  }

  // Routers that are read-only (no mutations) — allowed to use protectedProcedure only.
  const READ_ONLY_ROUTERS = new Set([
    "analytics.ts",
    "audit.ts",
    "dashboard.ts",
    "notifications.ts",
    "workload.ts",
  ]);

  // Routers that delegate ALL mutation logic to a library module (which calls logAudit).
  // The audit-trail check skips these because the audit happens in lib/<x>.ts, not the router.
  const DELEGATES_TO_LIB = new Set([
    "training.ts", // delegates to packages/api/src/lib/training.ts which calls logAudit
  ]);

  // Valid resources + actions enumerated EXACTLY from packages/auth/src/index.ts.
  // If you add a new resource/action there, add it here too.
  const VALID_RESOURCES = new Set([
    "staff",
    "work",
    "leave",
    "rota",
    "roster",
    "compliance",
    "contract",
    "appraisal",
    "report",
    "audit",
    "settings",
    "procurement",
    "notification",
    "access",
    "appraisal_cycle",
    "department_assignment",
    "promotion_letter",
    "performance_journal",
    "career_path",
    "ppe",
    "attendance",
    "callout",
    "timesheet",
    "shift",
    "feedback",
    "leave_policy",
  ]);
  // Per-resource action set from auth/src/index.ts statement table.
  // Verbs include CRUD plus domain-specific (submit/approve/reject/swap/assign/...).
  const VALID_ACTIONS = new Set([
    "create",
    "read",
    "update",
    "delete",
    "import",
    "export",
    "assign",
    "approve",
    "reject",
    "cancel",
    "swap",
    "publish",
    "submit",
    "process",
  ]);

  const MUTATION_VERBS =
    /^(create|update|delete|destroy|upsert|submit|approve|reject|review|publish|cancel|complete|markRead|markAllRead|dismiss|assign|unassign|fire|trigger|run|execute|insert|set|add|remove|toggle|enable|disable|activate|deactivate|generate|send|finalize|sign|signOff|close|reopen|adjust|override|swap|bulkSet|bulkImport|bulkCreate|bulkUpdate|link|unlink|markOrdered|markReceived|markRemoved|markReturned|markDamaged|markLost|setLifecycleDates|submitToHR|setOutcome|setRatings|setResponsibilities|setAchievements|setGoals|setTeamLead|setPlanNotes|addComment|addWeeklyUpdate|addParticipant|removeParticipant|addLink|addTimelineEntry|addResponder|removeResponder|linkService|unlinkService|createPIR|createFromTemplates|acknowledge|computeEOM|compute|upsertWeek|upsertYear|sendExpiryReminders|requestSync|triggerSync)$/i;

  for (const f of routerFiles) {
    const src = sources.get(f)!;
    const isReadOnly = READ_ONLY_ROUTERS.has(f);

    describe(`router ${f}`, () => {
      test("mutation procedures use requireRole (HI #4)", () => {
        if (isReadOnly) return;
        const lines = src.split("\n");
        const violations: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          const m = line.match(/^\s*(\w+):\s*protectedProcedure\b/);
          if (m && MUTATION_VERBS.test(m[1]!)) {
            violations.push(
              `L${i + 1}: ${m[1]} uses protectedProcedure (should be requireRole)`,
            );
          }
        }
        expect(violations).toEqual([]);
      });

      test("requireRole calls reference valid resource+action", () => {
        const re =
          /requireRole\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/g;
        const calls: Array<{ resource: string; action: string }> = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          calls.push({ resource: m[1]!, action: m[2]! });
        }
        if (calls.length === 0) return;
        const badResources = calls.filter(
          (c) => !VALID_RESOURCES.has(c.resource),
        );
        const badActions = calls.filter((c) => !VALID_ACTIONS.has(c.action));
        expect(badResources).toEqual([]);
        expect(badActions).toEqual([]);
      });

      test("mutations call logAudit() (audit trail rule)", () => {
        if (isReadOnly) return;
        if (DELEGATES_TO_LIB.has(f)) return; // audit happens in the lib module
        // Any requireRole call with a write-class action implies mutations
        const hasMutations =
          /requireRole\(\s*["'][^"']+["']\s*,\s*["'](create|update|delete|submit|approve|reject|cancel|swap|publish|import|process|assign)["']\s*\)/.test(
            src,
          );
        if (!hasMutations) return;
        const importsLogAudit =
          /import\s+\{[^}]*logAudit[^}]*\}\s+from/.test(src) ||
          /from\s+["'][^"']*audit["']/.test(src);
        const callsLogAudit = /logAudit\(/.test(src);
        expect(importsLogAudit || callsLogAudit).toBe(true);
      });
    });
  }
});
