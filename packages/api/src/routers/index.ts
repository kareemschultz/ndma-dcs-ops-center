import type { RouterClient } from "@orpc/server";
import { protectedProcedure, publicProcedure } from "../index";
import { accessRouter } from "./access";
import { accessRegistryRouter } from "./access-registry";
import { importRouter } from "./import";
import { appraisalsRouter } from "./appraisals";
import { appraisalCyclesRouter } from "./appraisal-cycles";
import { auditRouter } from "./audit";
import { complianceRouter } from "./compliance";
import { policyRouter } from "./policy";
import { attendanceTimeRouter } from "./attendance-time";
import { contractsRouter } from "./contracts";
import { attendanceExceptionsRouter } from "./attendance-exceptions";
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
import { calloutsRouter } from "./callouts";
import { timesheetsRouter } from "./timesheets";
import { workRouter } from "./work";
import { cyclesRouter } from "./cycles";
import { workloadRouter } from "./workload";
import { automationRouter } from "./automation";
import { overlaysRouter } from "./overlays";
import { analyticsRouter } from "./analytics";
import { platformsRouter } from "./platforms";

const healthCheck = publicProcedure.handler(() => "OK");
const privateData = protectedProcedure.handler(({ context }) => ({
  message: "This is private",
  user: context.session?.user,
}));

export type AppRouter = {
  healthCheck: typeof healthCheck;
  privateData: typeof privateData;
  access: typeof accessRouter;
  accessRegistry: typeof accessRegistryRouter;
  appraisals: typeof appraisalsRouter;
  appraisalCycles: typeof appraisalCyclesRouter;
  audit: typeof auditRouter;
  compliance: typeof complianceRouter;
  policy: typeof policyRouter;
  attendance: typeof attendanceExceptionsRouter;
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
  callouts: typeof calloutsRouter;
  import: typeof importRouter;
  work: typeof workRouter;
  timesheets: typeof timesheetsRouter;
  cycles: typeof cyclesRouter;
  workload: typeof workloadRouter;
  automation: typeof automationRouter;
  overlays: typeof overlaysRouter;
  analytics: typeof analyticsRouter;
  platforms: typeof platformsRouter;
};

export const appRouter: AppRouter = {
  healthCheck,
  privateData,
  access: accessRouter,
  accessRegistry: accessRegistryRouter,
  appraisals: appraisalsRouter,
  appraisalCycles: appraisalCyclesRouter,
  audit: auditRouter,
  compliance: complianceRouter,
  policy: policyRouter,
  attendance: attendanceExceptionsRouter,
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
  callouts: calloutsRouter,
  import: importRouter,
  work: workRouter,
  timesheets: timesheetsRouter,
  cycles: cyclesRouter,
  workload: workloadRouter,
  automation: automationRouter,
  overlays: overlaysRouter,
  analytics: analyticsRouter,
  platforms: platformsRouter,
};

export type AppRouterClient = RouterClient<AppRouter>;
