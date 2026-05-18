/**
 * Excel export utilities for DCS Ops Center.
 * Uses SheetJS (xlsx) for all spreadsheet generation.
 */
import * as XLSX from "xlsx";
import { effectiveLeaveLabel } from "@/lib/leave-status";

// ─── Generic helpers ────────────────────────────────────────────────────────────

function createWorkbook() {
  return XLSX.utils.book_new();
}

function sheetFromAOA(data: (string | number | null | undefined)[][]) {
  return XLSX.utils.aoa_to_sheet(data.map((row) => row.map((cell) => cell ?? "")));
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { bookType: "xlsx" });
}

function fmtDate(val: Date | string | null | undefined): string {
  if (!val) return "";
  try {
    const d = val instanceof Date ? val : new Date(val);
    return d.toLocaleDateString("en-GY");
  } catch {
    return String(val);
  }
}

// ─── Appraisals ─────────────────────────────────────────────────────────────────

type AppraisalRow = {
  id: string;
  status?: string | null;
  typeOfReview?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  scheduledDate?: Date | string | null;
  completedDate?: Date | string | null;
  totalScore?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  incrementPct?: number | null;
  approvedAt?: Date | string | null;
  staffProfile?: {
    user?: { name?: string | null; email?: string | null } | null;
    department?: { name?: string | null } | null;
  } | null;
  reviewer?: { user?: { name?: string | null } | null } | null;
  cycle?: { year?: number | null; half?: string | null } | null;
};

export function exportAppraisalsExcel(rows: AppraisalRow[], filename = "Appraisals.xlsx") {
  const headers = [
    "Staff Name",
    "Email",
    "Department",
    "Reviewer",
    "Cycle Year",
    "Period",
    "Type of Review",
    "Period Start",
    "Period End",
    "Status",
    "Total Score",
    "Max Score",
    "Percentage",
    "Increment %",
    "Scheduled Date",
    "Completed Date",
    "Approved Date",
  ];

  const data: (string | number | null)[][] = rows.map((r) => [
    r.staffProfile?.user?.name ?? "",
    r.staffProfile?.user?.email ?? "",
    r.staffProfile?.department?.name ?? "",
    r.reviewer?.user?.name ?? "",
    r.cycle?.year ?? null,
    r.cycle?.half?.toUpperCase() ?? "",
    r.typeOfReview ?? "",
    fmtDate(r.periodStart),
    fmtDate(r.periodEnd),
    r.status?.replace(/_/g, " ") ?? "",
    r.totalScore ?? null,
    r.maxScore ?? null,
    r.percentage ?? null,
    r.incrementPct ?? null,
    fmtDate(r.scheduledDate),
    fmtDate(r.completedDate),
    fmtDate(r.approvedAt),
  ]);

  const wb = createWorkbook();
  const ws = sheetFromAOA([headers, ...data]);

  // Column widths
  ws["!cols"] = [
    { wch: 28 }, // Staff Name
    { wch: 32 }, // Email
    { wch: 20 }, // Department
    { wch: 28 }, // Reviewer
    { wch: 10 }, // Year
    { wch: 8 },  // Period
    { wch: 16 }, // Type
    { wch: 14 }, // Period Start
    { wch: 14 }, // Period End
    { wch: 14 }, // Status
    { wch: 12 }, // Total Score
    { wch: 10 }, // Max Score
    { wch: 12 }, // Percentage
    { wch: 12 }, // Increment
    { wch: 16 }, // Scheduled
    { wch: 16 }, // Completed
    { wch: 16 }, // Approved
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Appraisals");
  downloadWorkbook(wb, filename);
}

// ─── Official NDMA Performance Evaluation Form ────────────────────────────────────
// Mirrors the official Appraisal_*.xlsx layout: Employee Information header,
// 8 rating categories with comments, Core Responsibilities, the 4 development
// summary sections, Achievements, Goals + Performance Indicators, the Score
// table, the Increment table, and the 5-step signature block.

const OFFICIAL_CATEGORIES: { key: string; label: string }[] = [
  { key: "organisational_skills", label: "Organisational Skills" },
  { key: "quality_of_work", label: "Quality of Work" },
  { key: "dependability", label: "Dependability" },
  { key: "communication_skills", label: "Communication Skills" },
  { key: "cooperation", label: "Cooperation" },
  { key: "initiative", label: "Initiative" },
  { key: "technical_skills", label: "Problem Solving" },
  { key: "attendance_punctuality", label: "Overall Professionalism" },
];

const RATING_WORD: Record<number, string> = {
  5: "Excellent",
  4: "Good",
  3: "Acceptable",
  2: "Needs Improvement",
  1: "Unsatisfactory",
};

export type OfficialAppraisalData = {
  employeeName: string;
  jobTitle: string;
  supervisor: string;
  department: string;
  location: string;
  typeOfReview: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  ratingMatrix: Record<string, number>;
  categoryComments: Record<string, string>;
  responsibilities: { title: string; rating: number }[];
  responsibilitiesComment: string;
  areasOfStrength: string;
  improvementsMade: string;
  areasForDevelopment: string;
  developmentActions: string;
  achievements: string[];
  goals: { goal: string; indicator: string }[];
};

export function exportOfficialAppraisalExcel(
  data: OfficialAppraisalData,
  filename = "Performance_Evaluation.xlsx",
) {
  const aoa: (string | number | null)[][] = [];
  const blank = (n = 1) => {
    for (let i = 0; i < n; i++) aoa.push([]);
  };

  aoa.push(["NATIONAL DATA MANAGEMENT AUTHORITY"]);
  aoa.push(["PERFORMANCE EVALUATION FORM"]);
  blank();
  aoa.push(["Employee Name:", data.employeeName, "Job Title:", data.jobTitle]);
  aoa.push(["Supervisor:", data.supervisor, "Department:", data.department]);
  aoa.push(["Location:", data.location]);
  aoa.push([
    "Evaluation Period:",
    "From:",
    data.periodStart,
    "To:",
    data.periodEnd,
  ]);
  aoa.push(["Type of Review:", data.typeOfReview || "Biannually"]);
  aoa.push(["Status:", data.status]);
  blank();

  aoa.push(["PERFORMANCE RATING CATEGORIES"]);
  aoa.push(["Scale: 5 Excellent · 4 Good · 3 Acceptable · 2 Needs Improvement · 1 Unsatisfactory"]);
  blank();
  aoa.push(["#", "Category", "Rating", "Performance Level", "Comments"]);
  let categoryTotal = 0;
  OFFICIAL_CATEGORIES.forEach((cat, i) => {
    const rating = data.ratingMatrix[cat.key] ?? 0;
    categoryTotal += rating;
    aoa.push([
      i + 1,
      cat.label,
      rating || "",
      rating ? RATING_WORD[rating] ?? "" : "",
      data.categoryComments[cat.key] ?? "",
    ]);
  });
  aoa.push(["", "General Performance Subtotal", categoryTotal, "out of 40", ""]);
  blank();

  aoa.push(["CORE RESPONSIBILITIES"]);
  aoa.push([
    "Insert the five most important responsibilities and rate each on the scale provided.",
  ]);
  blank();
  aoa.push(["#", "Responsibility", "Rating", "Performance Level", ""]);
  let respTotal = 0;
  for (let i = 0; i < 5; i++) {
    const r = data.responsibilities[i];
    const rating = r?.rating ?? 0;
    respTotal += rating;
    aoa.push([
      i + 1,
      r?.title ?? "",
      rating || "",
      rating ? RATING_WORD[rating] ?? "" : "",
      "",
    ]);
  }
  aoa.push(["", "Core Responsibilities Subtotal", respTotal, "out of 25", ""]);
  aoa.push(["Comments:", data.responsibilitiesComment]);
  blank();

  aoa.push(["SUMMARY & DEVELOPMENT"]);
  aoa.push(["Areas of Strength:", data.areasOfStrength]);
  aoa.push(["Improvements Made Over the Past Year:", data.improvementsMade]);
  aoa.push(["Areas for Development:", data.areasForDevelopment]);
  aoa.push(["Actions Planned to Address Development:", data.developmentActions]);
  blank();

  aoa.push(["KEY ACHIEVEMENTS"]);
  for (let i = 0; i < 5; i++) {
    aoa.push([`Achievement ${i + 1}`, data.achievements[i] ?? ""]);
  }
  blank();

  aoa.push(["GOALS FOR NEXT PERIOD"]);
  aoa.push(["#", "Goal to be Accomplished", "Performance Indicator"]);
  for (let i = 0; i < 5; i++) {
    const g = data.goals[i];
    aoa.push([`Goal ${i + 1}`, g?.goal ?? "", g?.indicator ?? ""]);
  }
  blank();

  const rawTotal = categoryTotal + respTotal;
  const percentage = Math.round((rawTotal / 65) * 100);
  const increment =
    percentage <= 60 ? 1 : percentage <= 70 ? 2 : percentage <= 80 ? 3 : percentage <= 90 ? 4 : 5;
  aoa.push(["SCORE"]);
  aoa.push(["Evaluation Category", "Score"]);
  OFFICIAL_CATEGORIES.forEach((cat) => {
    aoa.push([cat.label, data.ratingMatrix[cat.key] ?? 0]);
  });
  aoa.push(["Core Responsibilities", respTotal]);
  aoa.push(["TOTAL", `${rawTotal} / 65`]);
  aoa.push(["PERCENTAGE", `${percentage}%`]);
  aoa.push(["Increment (% of Salary)", `${increment}%`]);
  blank();

  aoa.push(["INCREMENT TABLE"]);
  aoa.push(["Score (%)", "Increment (%)"]);
  aoa.push(["Up to 60%", 1]);
  aoa.push(["61 - 70", 2]);
  aoa.push(["71 - 80", 3]);
  aoa.push(["81 - 90", 4]);
  aoa.push(["91 - 100", 5]);
  blank();

  aoa.push(["The above evaluation has been reviewed by the staff member."]);
  blank();
  aoa.push(["Employee's Signature", "", "Date"]);
  aoa.push(["Manager / Director's Signature", "", "Date"]);
  aoa.push(["Human Resources Manager", "", "Date"]);
  aoa.push(["Deputy General Manager, Administration", "", "Date"]);
  aoa.push(["General Manager", "", "Date"]);

  const wb = createWorkbook();
  const ws = sheetFromAOA(aoa);
  ws["!cols"] = [
    { wch: 36 },
    { wch: 44 },
    { wch: 14 },
    { wch: 22 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Performance Evaluation");
  downloadWorkbook(wb, filename);
}

// ─── Staff ───────────────────────────────────────────────────────────────────────

type StaffRow = {
  id?: string;
  fullName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  currentAppointment?: string | null;
  employmentStatus?: string | null;
  employmentType?: string | null;
  hireDate?: Date | string | null;
  contractEndDate?: Date | string | null;
  birthday?: Date | string | null;
  department?: { name?: string | null } | null;
  user?: { name?: string | null; email?: string | null } | null;
};

export function exportStaffExcel(rows: StaffRow[], filename = "Staff_List.xlsx") {
  const headers = [
    "Full Name",
    "Email",
    "Phone",
    "Department",
    "Appointment / Title",
    "Status",
    "Employment Type",
    "Hire Date",
    "Contract End Date",
    "Birthday",
  ];

  const data: (string | null)[][] = rows.map((r) => [
    r.fullName ?? r.user?.name ?? "",
    r.email ?? r.user?.email ?? "",
    r.phoneNumber ?? "",
    r.department?.name ?? "",
    r.currentAppointment ?? "",
    r.employmentStatus?.replace(/_/g, " ") ?? "",
    r.employmentType?.replace(/_/g, " ") ?? "",
    fmtDate(r.hireDate),
    fmtDate(r.contractEndDate),
    fmtDate(r.birthday),
  ]);

  const wb = createWorkbook();
  const ws = sheetFromAOA([headers, ...data]);
  ws["!cols"] = [
    { wch: 28 }, { wch: 34 }, { wch: 18 }, { wch: 22 }, { wch: 30 },
    { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Staff");
  downloadWorkbook(wb, filename);
}

// ─── Leave requests ──────────────────────────────────────────────────────────────

type LeaveRow = {
  id?: string;
  status?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  totalDays?: number | null;
  reason?: string | null;
  createdAt?: Date | string | null;
  approvedAt?: Date | string | null;
  staff?: { user?: { name?: string | null } | null; department?: { name?: string | null } | null } | null;
  staffProfile?: { user?: { name?: string | null } | null; department?: { name?: string | null } | null } | null;
  leaveType?: { name?: string | null } | null;
  approver?: { user?: { name?: string | null } | null } | null;
};

export function exportLeaveExcel(rows: LeaveRow[], filename = "Leave_Requests.xlsx") {
  const headers = [
    "Staff Name",
    "Department",
    "Leave Type",
    "Start Date",
    "End Date",
    "Days",
    "Status",
    "Reason",
    "Submitted",
    "Approved Date",
    "Approver",
  ];

  const data: (string | number | null)[][] = rows.map((r) => {
    const profile = r.staffProfile ?? r.staff;
    return [
      profile?.user?.name ?? "",
      profile?.department?.name ?? "",
      r.leaveType?.name ?? "",
      fmtDate(r.startDate),
      fmtDate(r.endDate),
      r.totalDays ?? null,
      // Display the *effective* status — an approved leave whose end date has
      // passed exports as "Completed" (matches the on-screen register).
      effectiveLeaveLabel(r.status, r.endDate ?? null),
      r.reason ?? "",
      fmtDate(r.createdAt),
      fmtDate(r.approvedAt),
      r.approver?.user?.name ?? "",
    ];
  });

  const wb = createWorkbook();
  const ws = sheetFromAOA([headers, ...data]);
  ws["!cols"] = [
    { wch: 28 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
    { wch: 8 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Leave Requests");
  downloadWorkbook(wb, filename);
}

// ─── Contracts ───────────────────────────────────────────────────────────────────

type ContractRow = {
  id?: string;
  contractNumber?: string | null;
  title?: string | null;
  contractType?: string | null;
  status?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  renewalLetterDueDate?: Date | string | null;
  appraisal1DueDate?: Date | string | null;
  appraisal2DueDate?: Date | string | null;
  submittedToHrAt?: Date | string | null;
  renewalOutcome?: string | null;
  staff?: { user?: { name?: string | null } | null; department?: { name?: string | null } | null } | null;
  staffProfile?: { user?: { name?: string | null } | null; department?: { name?: string | null } | null } | null;
};

export function exportContractsExcel(rows: ContractRow[], filename = "Contracts.xlsx") {
  const headers = [
    "Contract #",
    "Staff Name",
    "Department",
    "Title",
    "Type",
    "Status",
    "Start Date",
    "End Date",
    "Renewal Letter Due",
    "Appraisal 1 Due",
    "Appraisal 2 Due",
    "Submitted to HR",
    "Renewal Outcome",
  ];

  const data: (string | null)[][] = rows.map((r) => {
    const profile = r.staffProfile ?? r.staff;
    return [
      r.contractNumber ?? "",
      profile?.user?.name ?? "",
      profile?.department?.name ?? "",
      r.title ?? "",
      r.contractType?.replace(/_/g, " ") ?? "",
      r.status?.replace(/_/g, " ") ?? "",
      fmtDate(r.startDate),
      fmtDate(r.endDate),
      fmtDate(r.renewalLetterDueDate),
      fmtDate(r.appraisal1DueDate),
      fmtDate(r.appraisal2DueDate),
      fmtDate(r.submittedToHrAt),
      r.renewalOutcome ?? "",
    ];
  });

  const wb = createWorkbook();
  const ws = sheetFromAOA([headers, ...data]);
  ws["!cols"] = [
    { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 30 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 },
    { wch: 16 }, { wch: 18 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Contracts");
  downloadWorkbook(wb, filename);
}

// ─── Work items ──────────────────────────────────────────────────────────────────

type WorkItemRow = {
  id?: string;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  priority?: string | null;
  dueDate?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  assignee?: { user?: { name?: string | null } | null } | null;
  initiative?: { title?: string | null } | null;
  department?: { name?: string | null } | null;
};

export function exportWorkItemsExcel(rows: WorkItemRow[], filename = "Work_Register.xlsx") {
  const headers = [
    "Title",
    "Type",
    "Status",
    "Priority",
    "Assigned To",
    "Initiative",
    "Department",
    "Due Date",
    "Created",
    "Updated",
  ];

  const data: (string | null)[][] = rows.map((r) => [
    r.title ?? "",
    r.type?.replace(/_/g, " ") ?? "",
    r.status?.replace(/_/g, " ") ?? "",
    r.priority ?? "",
    r.assignee?.user?.name ?? "",
    r.initiative?.title ?? "",
    r.department?.name ?? "",
    fmtDate(r.dueDate),
    fmtDate(r.createdAt),
    fmtDate(r.updatedAt),
  ]);

  const wb = createWorkbook();
  const ws = sheetFromAOA([headers, ...data]);
  ws["!cols"] = [
    { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 24 },
    { wch: 30 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Work Register");
  downloadWorkbook(wb, filename);
}

// ─── Incidents ───────────────────────────────────────────────────────────────────

type IncidentRow = {
  id?: string;
  title?: string | null;
  status?: string | null;
  severity?: string | null;
  createdAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  description?: string | null;
  affectedServices?: Array<{ service?: { name?: string | null } | null }>;
  lead?: { user?: { name?: string | null } | null } | null;
};

export function exportIncidentsExcel(rows: IncidentRow[], filename = "Incidents.xlsx") {
  const headers = [
    "Title",
    "Status",
    "Severity",
    "Lead",
    "Affected Services",
    "Description",
    "Raised",
    "Resolved",
  ];

  const data: (string | null)[][] = rows.map((r) => [
    r.title ?? "",
    r.status?.replace(/_/g, " ") ?? "",
    r.severity ?? "",
    r.lead?.user?.name ?? "",
    (r.affectedServices ?? []).map((s) => s.service?.name ?? "").filter(Boolean).join(", "),
    r.description ?? "",
    fmtDate(r.createdAt),
    fmtDate(r.resolvedAt),
  ]);

  const wb = createWorkbook();
  const ws = sheetFromAOA([headers, ...data]);
  ws["!cols"] = [
    { wch: 36 }, { wch: 14 }, { wch: 12 }, { wch: 24 },
    { wch: 30 }, { wch: 40 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Incidents");
  downloadWorkbook(wb, filename);
}

// ─── Procurement ──────────────────────────────────────────────────────────────────

type PRRow = {
  id?: string;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  estimatedTotal?: number | null;
  createdAt?: Date | string | null;
  submittedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  requester?: { user?: { name?: string | null } | null } | null;
  staffProfile?: { user?: { name?: string | null } | null } | null;
  department?: { name?: string | null } | null;
};

export function exportProcurementExcel(rows: PRRow[], filename = "Procurement.xlsx") {
  const headers = [
    "Title",
    "Status",
    "Priority",
    "Requester",
    "Department",
    "Est. Total (GYD)",
    "Submitted",
    "Approved",
    "Created",
  ];

  const data: (string | number | null)[][] = rows.map((r) => {
    const req = r.requester ?? r.staffProfile;
    return [
      r.title ?? "",
      r.status?.replace(/_/g, " ") ?? "",
      r.priority ?? "",
      req?.user?.name ?? "",
      r.department?.name ?? "",
      r.estimatedTotal ?? null,
      fmtDate(r.submittedAt),
      fmtDate(r.approvedAt),
      fmtDate(r.createdAt),
    ];
  });

  const wb = createWorkbook();
  const ws = sheetFromAOA([headers, ...data]);
  ws["!cols"] = [
    { wch: 36 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 22 },
    { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Procurement");
  downloadWorkbook(wb, filename);
}

// ─── NOC Performance Journal ──────────────────────────────────────────────────────

type NOCJournalRow = {
  id?: string;
  year?: number | null;
  month?: number | null;
  category?: string | null;
  count?: number | null;
  narrative?: string | null;
  staffProfile?: { user?: { name?: string | null } | null } | null;
};

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function exportNOCJournalExcel(rows: NOCJournalRow[], filename = "NOC_Performance_Journal.xlsx") {
  const headers = [
    "Staff Name",
    "Year",
    "Month",
    "Category",
    "Count",
    "Narrative",
  ];

  const data: (string | number | null)[][] = rows.map((r) => [
    r.staffProfile?.user?.name ?? "",
    r.year ?? null,
    r.month != null ? MONTH_NAMES[r.month] ?? String(r.month) : "",
    r.category?.replace(/_/g, " ") ?? "",
    r.count ?? null,
    r.narrative ?? "",
  ]);

  const wb = createWorkbook();
  const ws = sheetFromAOA([headers, ...data]);
  ws["!cols"] = [
    { wch: 28 }, { wch: 8 }, { wch: 12 }, { wch: 24 }, { wch: 8 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Performance Journal");
  downloadWorkbook(wb, filename);
}
