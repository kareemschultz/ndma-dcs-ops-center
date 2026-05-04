import type { RouterClient } from "@orpc/server";
import { protectedProcedure, publicProcedure } from "../index";
import { accessRouter } from "./access";
import { importRouter } from "./import";
import { appraisalsRouter } from "./appraisals";
import { appraisalCyclesRouter } from "./appraisal-cycles";
import { auditRouter } from "./audit";
import { complianceRouter } from "./compliance";
import { policyRouter } from "./policy";
import { attendanceTimeRouter } from "./attendance-time";
import { contractsRouter } from "./contracts";
import { departmentAssignmentsRouter } from "./department-assignments";
import { departmentsRouter } from "./departments";
import { dashboardRouter } from "./dashboard";
import { escalationRouter } from "./escalation";
import { hrDocsRouter } from "./hr-docs";
import { incidentsRouter } from "./incidents";
import { leaveRouter } from "./leave";
import { leavePoliciesRouter } from "./leave-policies";
import { notificationsRouter } from "./notifications";
import { nocShiftsRouter } from "./noc-shifts";
import { ppeRouter } from "./ppe";
import { procurementRouter } from "./procurement";
import { rosterRouter } from "./roster";
import { rotaRouter } from "./rota";
import { servicesRouter } from "./services";
import { staffRouter } from "./staff";
import { tempChangesRouter } from "./temp-changes";
import { timesheetsRouter } from "./timesheets";
import { workRouter } from "./work";
import { cyclesRouter } from "./cycles";
import { workloadRouter } from "./workload";
import { automationRouter } from "./automation";
import { overlaysRouter } from "./overlays";
import { analyticsRouter } from "./analytics";
// Phase 1 — Access Registry (master plan §5.2)
import { platformsRouter } from "./platforms";
import { accessRegistryRouter } from "./access-registry";
// Phase 3 — Scheduling unification
import { schedulingRouter } from "./scheduling";
// Phase 5 — NOC Performance
import { nocPerformanceRouter } from "./noc-performance";
// Phase 6 — Contracts lifecycle
import { careerProgressionRouter } from "./career-progression";
// Phase 7 — Training (plans, cert catalog, exam vouchers, events, in-house log, syllabi, onboarding)
import { trainingRouter } from "./training";
import {
  trainingPlansRouter,
  certCatalogRouter,
  examVouchersRouter,
  trainingEventsRouter,
  inHouseLogRouter,
  syllabiRouter,
  assessmentQuestionsRouter,
  onboardingRouter,
} from "./training-phase7";
// Phase 8 — PPE matrix, lateness quarterly grid, timesheet documents
import { latenessRouter } from "./lateness";
import { timesheetDocumentsRouter } from "./timesheet-documents";
// Phase 4-5 spec follow-up (migration 0029) — commendations + appraisal_tracker_view
import {
  appraisalTrackerRouter,
  commendationsRouter,
} from "./commendations";

const healthCheck = publicProcedure.handler(() => "OK");
const privateData = protectedProcedure.handler(({ context }) => ({
  message: "This is private",
  user: context.session?.user,
}));

export type AppRouter = {
  healthCheck: typeof healthCheck;
  privateData: typeof privateData;
  access: typeof accessRouter;
  appraisals: typeof appraisalsRouter;
  appraisalCycles: typeof appraisalCyclesRouter;
  audit: typeof auditRouter;
  compliance: typeof complianceRouter;
  policy: typeof policyRouter;
  attendanceTime: typeof attendanceTimeRouter;
  contracts: typeof contractsRouter;
  departmentAssignments: typeof departmentAssignmentsRouter;
  departments: typeof departmentsRouter;
  dashboard: typeof dashboardRouter;
  escalation: typeof escalationRouter;
  hrDocs: typeof hrDocsRouter;
  incidents: typeof incidentsRouter;
  leave: typeof leaveRouter;
  leavePolicies: typeof leavePoliciesRouter;
  notifications: typeof notificationsRouter;
  nocShifts: typeof nocShiftsRouter;
  ppe: typeof ppeRouter;
  procurement: typeof procurementRouter;
  roster: typeof rosterRouter;
  rota: typeof rotaRouter;
  services: typeof servicesRouter;
  staff: typeof staffRouter;
  tempChanges: typeof tempChangesRouter;
  import: typeof importRouter;
  work: typeof workRouter;
  timesheets: typeof timesheetsRouter;
  cycles: typeof cyclesRouter;
  workload: typeof workloadRouter;
  automation: typeof automationRouter;
  overlays: typeof overlaysRouter;
  analytics: typeof analyticsRouter;
  platforms: typeof platformsRouter;
  accessRegistry: typeof accessRegistryRouter;
  scheduling: typeof schedulingRouter;
  nocPerformance: typeof nocPerformanceRouter;
  careerProgression: typeof careerProgressionRouter;
  // Phase 7 — Training
  training: typeof trainingRouter;
  trainingPlans: typeof trainingPlansRouter;
  certCatalog: typeof certCatalogRouter;
  examVouchers: typeof examVouchersRouter;
  trainingEvents: typeof trainingEventsRouter;
  inHouseLog: typeof inHouseLogRouter;
  syllabi: typeof syllabiRouter;
  assessmentQuestions: typeof assessmentQuestionsRouter;
  onboarding: typeof onboardingRouter;
  // Phase 8 — PPE matrix, lateness quarterly grid, timesheet documents
  lateness: typeof latenessRouter;
  timesheetDocuments: typeof timesheetDocumentsRouter;
  // Phase 4-5 spec follow-up (migration 0029)
  commendations: typeof commendationsRouter;
  appraisalTracker: typeof appraisalTrackerRouter;
};

export const appRouter: AppRouter = {
  healthCheck,
  privateData,
  access: accessRouter,
  appraisals: appraisalsRouter,
  appraisalCycles: appraisalCyclesRouter,
  audit: auditRouter,
  compliance: complianceRouter,
  policy: policyRouter,
  attendanceTime: attendanceTimeRouter,
  contracts: contractsRouter,
  departmentAssignments: departmentAssignmentsRouter,
  departments: departmentsRouter,
  dashboard: dashboardRouter,
  escalation: escalationRouter,
  hrDocs: hrDocsRouter,
  incidents: incidentsRouter,
  leave: leaveRouter,
  leavePolicies: leavePoliciesRouter,
  notifications: notificationsRouter,
  nocShifts: nocShiftsRouter,
  ppe: ppeRouter,
  procurement: procurementRouter,
  roster: rosterRouter,
  rota: rotaRouter,
  services: servicesRouter,
  staff: staffRouter,
  tempChanges: tempChangesRouter,
  import: importRouter,
  work: workRouter,
  timesheets: timesheetsRouter,
  cycles: cyclesRouter,
  workload: workloadRouter,
  automation: automationRouter,
  overlays: overlaysRouter,
  analytics: analyticsRouter,
  platforms: platformsRouter,
  accessRegistry: accessRegistryRouter,
  scheduling: schedulingRouter,
  nocPerformance: nocPerformanceRouter,
  careerProgression: careerProgressionRouter,
  // Phase 7 — Training
  training: trainingRouter,
  trainingPlans: trainingPlansRouter,
  certCatalog: certCatalogRouter,
  examVouchers: examVouchersRouter,
  trainingEvents: trainingEventsRouter,
  inHouseLog: inHouseLogRouter,
  syllabi: syllabiRouter,
  assessmentQuestions: assessmentQuestionsRouter,
  onboarding: onboardingRouter,
  // Phase 8 — PPE matrix, lateness quarterly grid, timesheet documents
  lateness: latenessRouter,
  timesheetDocuments: timesheetDocumentsRouter,
  // Phase 4-5 spec follow-up (migration 0029)
  commendations: commendationsRouter,
  appraisalTracker: appraisalTrackerRouter,
};

export type AppRouterClient = RouterClient<AppRouter>;
