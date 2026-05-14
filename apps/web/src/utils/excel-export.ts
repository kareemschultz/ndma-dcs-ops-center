/**
 * Excel export utilities for DCS Ops Center.
 * Uses SheetJS (xlsx) for all spreadsheet generation.
 */
import * as XLSX from "xlsx";

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
      r.status?.replace(/_/g, " ") ?? "",
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
