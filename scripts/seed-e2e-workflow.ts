import { eq } from "drizzle-orm";

import {
  appraisalNotes,
  appraisalScores,
  appraisals,
  db,
  leaveRequests,
  leaveTypes,
  staffProfiles,
  workItemComments,
  workItems,
} from "@ndma-dcs-staff-portal/db";

const now = new Date();
const future = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);
const completedSoon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);

const staff = {
  kareem: "sp-kareem",
  shemar: "sp-shemar",
  richie: "sp-richie",
  bheesham: "sp-bheesham",
  nicolai: "sp-nicolai",
  sachin: "sp-sachin",
  ataybia: "sp-ataybia",
};

// Keep the appraisal approval chain deterministic for Playwright:
// team lead -> manager -> PA.
const relationshipSeeds = [
  { id: staff.kareem, reportsTo: staff.nicolai, teamLeadId: staff.nicolai },
  { id: staff.shemar, reportsTo: staff.sachin, teamLeadId: staff.sachin },
  { id: staff.richie, reportsTo: staff.ataybia, teamLeadId: staff.ataybia },
] as const;

for (const relation of relationshipSeeds) {
  await db
    .update(staffProfiles)
    .set({
      reportsTo: relation.reportsTo,
      teamLeadId: relation.teamLeadId,
      updatedAt: now,
    })
    .where(eq(staffProfiles.id, relation.id));
}

const annualLeave = await db.query.leaveTypes.findFirst({
  where: eq(leaveTypes.name, "Annual Leave"),
});

if (annualLeave) {
  await db.delete(leaveRequests).where(eq(leaveRequests.id, "leave-e2e-pending-kareem"));
  await db
    .insert(leaveRequests)
    .values({
      id: "leave-e2e-pending-kareem",
      staffProfileId: staff.kareem,
      leaveTypeId: annualLeave.id,
      startDate: "2026-05-18",
      endDate: "2026-05-22",
      totalDays: 5,
      reason: "E2E manager approval request",
      status: "pending",
      overlapOverride: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

await db.delete(workItemComments).where(eq(workItemComments.id, "work-e2e-kareem-comment"));
await db.delete(workItems).where(eq(workItems.id, "work-e2e-kareem"));
await db
  .insert(workItems)
  .values({
    id: "work-e2e-kareem",
    title: "E2E profile verification",
    description: "Used for role-based smoke tests and CRUD verification.",
    type: "routine",
    status: "todo",
    priority: "high",
    assignedToId: staff.kareem,
    departmentId: "dept-asn",
    sourceSystem: "e2e-seed",
    sourceReference: "work-e2e-001",
    dueDate: "2026-05-05",
    estimatedHours: "2",
    createdById: "user-admin",
    createdAt: now,
    updatedAt: now,
  })
  .onConflictDoNothing();

await db
  .insert(workItemComments)
  .values({
    id: "work-e2e-kareem-comment",
    workItemId: "work-e2e-kareem",
    authorId: "user-admin",
    body: "Initial smoke-test item created for E2E validation.",
    createdAt: now,
    updatedAt: now,
  })
  .onConflictDoNothing();

const appraisalSeed = [
  {
    id: "appraisal-e2e-kareem-draft",
    staffProfileId: staff.kareem,
    reviewerId: staff.nicolai,
    teamLeadId: staff.nicolai,
    year: 2026,
    period: "Oct 2025 - Apr 2026",
    totalScore: 78,
    status: "Draft",
    periodStart: "2025-10-01",
    periodEnd: "2026-04-30",
    submittedAt: null,
    submittedById: null,
    approvedAt: null,
    approvedById: null,
    completedDate: null,
  },
  {
    id: "appraisal-e2e-kareem-completed",
    staffProfileId: staff.kareem,
    reviewerId: staff.nicolai,
    teamLeadId: staff.nicolai,
    year: 2025,
    period: "Apr 2025 - Sep 2025",
    totalScore: 84,
    status: "Completed",
    periodStart: "2025-04-01",
    periodEnd: "2025-09-30",
    submittedAt: now,
    submittedById: "user-nicolai",
    approvedAt: now,
    approvedById: "user-sachin",
    completedDate: completedSoon,
  },
  {
    id: "appraisal-e2e-shemar-pending",
    staffProfileId: staff.shemar,
    reviewerId: staff.nicolai,
    teamLeadId: staff.nicolai,
    year: 2026,
    period: "Oct 2025 - Apr 2026",
    totalScore: 91,
    status: "Pending_Approval",
    periodStart: "2025-10-01",
    periodEnd: "2026-04-30",
    submittedAt: now,
    submittedById: "user-nicolai",
    approvedAt: null,
    approvedById: null,
    completedDate: null,
  },
  {
    id: "appraisal-e2e-richie-approved",
    staffProfileId: staff.richie,
    reviewerId: staff.sachin,
    teamLeadId: staff.gerard,
    year: 2026,
    period: "Oct 2025 - Apr 2026",
    totalScore: 88,
    status: "Approved_By_Manager",
    periodStart: "2025-10-01",
    periodEnd: "2026-04-30",
    submittedAt: now,
    submittedById: "user-sachin",
    approvedAt: now,
    approvedById: "user-sachin",
    completedDate: null,
  },
  {
    id: "appraisal-e2e-bheesham-processed",
    staffProfileId: staff.bheesham,
    reviewerId: staff.devon,
    teamLeadId: staff.devon,
    year: 2025,
    period: "Apr 2025 - Sep 2025",
    totalScore: 86,
    status: "Processed_By_PA",
    periodStart: "2025-04-01",
    periodEnd: "2025-09-30",
    submittedAt: now,
    submittedById: "user-devon",
    approvedAt: now,
    approvedById: "user-sachin",
    completedDate: null,
  },
] as const;

for (const row of appraisalSeed) {
  // Reset each seeded appraisal to a deterministic baseline on every run.
  await db.delete(appraisalScores).where(eq(appraisalScores.appraisalId, row.id));
  await db.delete(appraisalNotes).where(eq(appraisalNotes.appraisalId, row.id));
  await db.delete(appraisals).where(eq(appraisals.id, row.id));

  await db
    .insert(appraisals)
    .values({
      id: row.id,
      staffProfileId: row.staffProfileId,
      reviewerId: row.reviewerId,
      teamLeadId: row.teamLeadId,
      year: row.year,
      period: row.period,
      totalScore: row.totalScore,
      evaluationType: "Standard",
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      submittedAt: row.submittedAt,
      submittedById: row.submittedById,
      approvedAt: row.approvedAt,
      approvedById: row.approvedById,
      completedDate: row.completedDate,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(appraisalScores)
    .values([
      {
        appraisalId: row.id,
        category: "Technical",
        criteria: "Operational Knowledge",
        score: Math.max(1, Math.min(5, Math.round(row.totalScore / 20))),
        comment: "Seeded for end-to-end workflow coverage.",
        createdAt: now,
        updatedAt: now,
      },
      {
        appraisalId: row.id,
        category: "Delivery",
        criteria: "Task Completion",
        score: Math.max(1, Math.min(5, Math.round(row.totalScore / 22))),
        comment: "Seeded for end-to-end workflow coverage.",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(appraisalNotes)
    .values({
      appraisalId: row.id,
      noteType: "Summary",
      content: `Seeded appraisal record for ${row.period}.`,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

await db
await db
  .update(staffProfiles)
  .set({
    phoneNumber: "+592 555-0001",
    emergencyContacts: [
      { name: "Test Contact", phone: "+592 555-9999", relation: "Sibling" },
    ],
    updatedAt: now,
  })
  .where(eq(staffProfiles.id, staff.kareem));

console.log("Seeded E2E workflow records.");
