import { ORPCError, call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db, platforms, serviceAccessRegistry, staffProfiles, user } from "@ndma-dcs-staff-portal/db";
import { accessRegistryRouter } from "../src/routers/access-registry";
import { platformsRouter } from "../src/routers/platforms";

type Actor = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

type Fixtures = {
  admin: Actor;
  manager: Actor;
  teamLead: Actor;
  otherTeamLead: Actor;
  staff: Actor;
  peerStaff: Actor;
  teamLeadProfileId: string;
  otherTeamLeadProfileId: string;
  staffProfileId: string;
  peerStaffProfileId: string;
  seededPlatformId: string;
};

let fixtures: Fixtures;

function makeContext(actor: Actor) {
  return {
    session: {
      user: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
      },
    },
    userRole: actor.role,
    ipAddress: "127.0.0.1",
    userAgent: "rbac-matrix-test",
    requestId: `rbac-${crypto.randomUUID()}`,
  };
}

async function expectForbidden(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected FORBIDDEN error");
  } catch (error) {
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError).code).toBe("FORBIDDEN");
  }
}

async function createTempPlatform() {
  const [row] = await db
    .insert(platforms)
    .values({
      name: `RBAC Test ${crypto.randomUUID()}`,
      category: "other",
      authType: "local",
      syncMode: "manual_only",
      active: true,
    })
    .returning();

  if (!row) throw new Error("Failed to create temporary platform");
  return row;
}

async function withTempRegistryRow<T>(run: (platformId: string, registryId: string) => Promise<T>) {
  const platform = await createTempPlatform();
  try {
    const [created] = await db
      .insert(serviceAccessRegistry)
      .values({
        staffId: fixtures.staffProfileId,
        platformId: platform.id,
        accountUsername: "rbac-test",
        accountType: "local",
        accountActive: true,
        privilegeLevel: "operator",
        privilegeGroups: ["ops"],
        usernameSource: "manual",
        accountTypeSource: "manual",
        privilegeSource: "manual",
        groupsSource: "manual",
      })
      .returning();

    if (!created) throw new Error("Failed to create temporary access registry row");

    return await run(platform.id, created.id);
  } finally {
    await db.delete(serviceAccessRegistry).where(eq(serviceAccessRegistry.platformId, platform.id));
    await db.delete(platforms).where(eq(platforms.id, platform.id));
  }
}

beforeAll(async () => {
  const [admin, manager, teamLead, otherTeamLead, staff, peerStaff, seededPlatform] =
    await Promise.all([
      db.query.user.findFirst({ where: eq(user.email, "admin@ndma.gov") }),
      db.query.user.findFirst({ where: eq(user.email, "sachin.ramsuran@ndma.gov") }),
      db.query.user.findFirst({ where: eq(user.email, "nicolai.mahangi@ndma.gov") }),
      db.query.user.findFirst({ where: eq(user.email, "devon.abrams@ndma.gov") }),
      db.query.user.findFirst({ where: eq(user.email, "kareem.schultz@ndma.gov") }),
      db.query.user.findFirst({ where: eq(user.email, "richie.goring@ndma.gov") }),
      db.query.platforms.findFirst({ where: eq(platforms.active, true) }),
    ]);

  if (!admin || !manager || !teamLead || !otherTeamLead || !staff || !peerStaff || !seededPlatform) {
    throw new Error("RBAC fixtures missing; make sure local migrations and seed data are applied.");
  }

  const [teamLeadProfile, otherTeamLeadProfile, staffProfile, peerStaffProfile] = await Promise.all([
    db.query.staffProfiles.findFirst({ where: eq(staffProfiles.userId, teamLead.id) }),
    db.query.staffProfiles.findFirst({ where: eq(staffProfiles.userId, otherTeamLead.id) }),
    db.query.staffProfiles.findFirst({ where: eq(staffProfiles.userId, staff.id) }),
    db.query.staffProfiles.findFirst({ where: eq(staffProfiles.userId, peerStaff.id) }),
  ]);

  if (!teamLeadProfile || !otherTeamLeadProfile || !staffProfile || !peerStaffProfile) {
    throw new Error("RBAC fixtures missing; make sure local migrations and seed data are applied.");
  }

  fixtures = {
    admin,
    manager,
    teamLead,
    otherTeamLead,
    staff,
    peerStaff,
    teamLeadProfileId: teamLeadProfile.id,
    otherTeamLeadProfileId: otherTeamLeadProfile.id,
    staffProfileId: staffProfile.id,
    peerStaffProfileId: peerStaffProfile.id,
    seededPlatformId: seededPlatform.id,
  };
});

describe("Phase 1 RBAC matrix", () => {
  test("platforms.list allows all authenticated roles", async () => {
    for (const actor of [fixtures.staff, fixtures.teamLead, fixtures.manager, fixtures.admin]) {
      const rows = await call(platformsRouter.list, undefined, { context: makeContext(actor) });
      expect(Array.isArray(rows)).toBe(true);
    }
  });

  test("platforms.get allows all authenticated roles", async () => {
    for (const actor of [fixtures.staff, fixtures.teamLead, fixtures.manager, fixtures.admin]) {
      const row = await call(platformsRouter.get, { id: fixtures.seededPlatformId }, { context: makeContext(actor) });
      expect(row.id).toBe(fixtures.seededPlatformId);
    }
  });

  test("platforms.create is admin only", async () => {
    for (const actor of [fixtures.staff, fixtures.teamLead, fixtures.manager]) {
      await expectForbidden(
        call(platformsRouter.create, {
          name: `RBAC Create ${crypto.randomUUID()}`,
          category: "other",
          authType: "local",
          syncMode: "manual_only",
        }, { context: makeContext(actor) }),
      );
    }

    const created = await call(platformsRouter.create, {
      name: `RBAC Create ${crypto.randomUUID()}`,
      category: "other",
      authType: "local",
      syncMode: "manual_only",
    }, { context: makeContext(fixtures.admin) });

    expect(created.name).toContain("RBAC Create");

    await db.delete(platforms).where(eq(platforms.id, created.id));
  });

  test("platforms.update is admin only", async () => {
    const temp = await createTempPlatform();
    try {
      for (const actor of [fixtures.staff, fixtures.teamLead, fixtures.manager]) {
        await expectForbidden(
          call(platformsRouter.update, {
            id: temp.id,
            name: temp.name,
            category: "other",
            authType: "local",
            syncMode: "manual_only",
          }, { context: makeContext(actor) }),
        );
      }

      const updated = await call(platformsRouter.update, {
        id: temp.id,
        name: `${temp.name} Updated`,
        category: "monitoring",
        authType: "local",
        syncMode: "api_read_only",
        notes: "updated by RBAC test",
      }, { context: makeContext(fixtures.admin) });

      expect(updated.name).toBe(`${temp.name} Updated`);
    } finally {
      await db.delete(platforms).where(eq(platforms.id, temp.id));
    }
  });

  test("platforms.disable is admin only", async () => {
    const temp = await createTempPlatform();
    try {
      for (const actor of [fixtures.staff, fixtures.teamLead, fixtures.manager]) {
        await expectForbidden(
          call(platformsRouter.disable, { id: temp.id }, { context: makeContext(actor) }),
        );
      }

      const disabled = await call(platformsRouter.disable, { id: temp.id }, { context: makeContext(fixtures.admin) });
      expect(disabled.active).toBe(false);
    } finally {
      await db.delete(platforms).where(eq(platforms.id, temp.id));
    }
  });

  test("accessRegistry.listByStaff allows self and direct reports only for team leads", async () => {
    const selfRows = await call(
      accessRegistryRouter.listByStaff,
      { staffId: fixtures.staffProfileId },
      { context: makeContext(fixtures.staff) },
    );
    expect(Array.isArray(selfRows)).toBe(true);

    await expectForbidden(
      call(
        accessRegistryRouter.listByStaff,
        { staffId: fixtures.peerStaffProfileId },
        { context: makeContext(fixtures.staff) },
      ),
    );

    const directReportRows = await call(
      accessRegistryRouter.listByStaff,
      { staffId: fixtures.staffProfileId },
      { context: makeContext(fixtures.teamLead) },
    );
    expect(Array.isArray(directReportRows)).toBe(true);

    await expectForbidden(
      call(
        accessRegistryRouter.listByStaff,
        { staffId: fixtures.staffProfileId },
        { context: makeContext(fixtures.otherTeamLead) },
      ),
    );
  });

  test("accessRegistry.listByStaff allows managers and admins for any staff", async () => {
    await expect(
      call(accessRegistryRouter.listByStaff, { staffId: fixtures.peerStaffProfileId }, { context: makeContext(fixtures.manager) }),
    ).resolves.toBeArray();

    await expect(
      call(accessRegistryRouter.listByStaff, { staffId: fixtures.peerStaffProfileId }, { context: makeContext(fixtures.admin) }),
    ).resolves.toBeArray();
  });

  test("accessRegistry.listByPlatform is manager/admin only", async () => {
    await expectForbidden(
      call(accessRegistryRouter.listByPlatform, { platformId: fixtures.seededPlatformId }, { context: makeContext(fixtures.staff) }),
    );
    await expectForbidden(
      call(accessRegistryRouter.listByPlatform, { platformId: fixtures.seededPlatformId }, { context: makeContext(fixtures.teamLead) }),
    );

    await expect(
      call(accessRegistryRouter.listByPlatform, { platformId: fixtures.seededPlatformId }, { context: makeContext(fixtures.manager) }),
    ).resolves.toBeArray();

    await expect(
      call(accessRegistryRouter.listByPlatform, { platformId: fixtures.seededPlatformId }, { context: makeContext(fixtures.admin) }),
    ).resolves.toBeArray();
  });

  test("accessRegistry.create is manager/admin only", async () => {
    await expectForbidden(
      call(accessRegistryRouter.create, {
        staffId: fixtures.staffProfileId,
        platformId: fixtures.seededPlatformId,
        accountUsername: "rbac-create",
        accountType: "local",
        privilegeLevel: "operator",
        privilegeGroups: [],
      }, { context: makeContext(fixtures.staff) }),
    );

    await expectForbidden(
      call(accessRegistryRouter.create, {
        staffId: fixtures.staffProfileId,
        platformId: fixtures.seededPlatformId,
        accountUsername: "rbac-create",
        accountType: "local",
        privilegeLevel: "operator",
        privilegeGroups: [],
      }, { context: makeContext(fixtures.teamLead) }),
    );

    const created = await call(accessRegistryRouter.create, {
      staffId: fixtures.staffProfileId,
      platformId: fixtures.seededPlatformId,
      accountUsername: "rbac-create",
      accountType: "local",
      privilegeLevel: "operator",
      privilegeGroups: [],
    }, { context: makeContext(fixtures.manager) });

    expect(created.staffId).toBe(fixtures.staffProfileId);

    await db.delete(serviceAccessRegistry).where(eq(serviceAccessRegistry.id, created.id));
  });

  test("accessRegistry.update is manager/admin only", async () => {
    await withTempRegistryRow(async (platformId, registryId) => {
      for (const actor of [fixtures.staff, fixtures.teamLead]) {
        await expectForbidden(
          call(accessRegistryRouter.update, {
            id: registryId,
            accountUsername: "rbac-update",
            privilegeLevel: "read_only",
          }, { context: makeContext(actor) }),
        );
      }

      const updated = await call(accessRegistryRouter.update, {
        id: registryId,
        accountUsername: "rbac-update",
        privilegeLevel: "read_only",
      }, { context: makeContext(fixtures.manager) });

      expect(updated.accountUsername).toBe("rbac-update");
      expect(updated.platformId).toBe(platformId);
    });
  });

  test("accessRegistry.delete is admin only", async () => {
    await withTempRegistryRow(async (_platformId, registryId) => {
      for (const actor of [fixtures.staff, fixtures.teamLead, fixtures.manager]) {
        await expectForbidden(
          call(accessRegistryRouter.delete, { id: registryId }, { context: makeContext(actor) }),
        );
      }

      await expect(
        call(accessRegistryRouter.delete, { id: registryId }, { context: makeContext(fixtures.admin) }),
      ).resolves.toBeDefined();
    });
  });
});
