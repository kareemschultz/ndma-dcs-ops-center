import { useState, useRef, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Upload,
  Users,
  GraduationCap,
  FileText,
  ClipboardCheck,
  ClipboardList,
  CalendarClock,
  CalendarRange,
  CalendarOff,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  FileSpreadsheet,
  History,
  XCircle,
  HardHat,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ndma-dcs-staff-portal/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ndma-dcs-staff-portal/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/import/")({
  component: ImportPage,
});

// ── Types ──────────────────────────────────────────────────────────────────

type ImportType =
  | "staff"
  | "training"
  | "contracts"
  | "work"
  | "operations_work_update"
  | "roster"
  | "leave"
  | "ppe"
  | "appraisals"
  | "calendar_events"
  | "promotions"
  | "exam_schedule"
  | "onboarding"
  | "policy"
  | "forms";

interface ImportTarget {
  id: ImportType;
  title: string;
  description: string;
  icon: React.ElementType;
  columns: string[];
  requiredColumns: string[];
  sampleRows: string[][];
  notes: string;
}

interface ParsedRow {
  [key: string]: string;
}

interface ValidatedRow {
  data: ParsedRow;
  errors: string[];
}

// ── Config ─────────────────────────────────────────────────────────────────

const IMPORT_TARGETS: ImportTarget[] = [
  {
    id: "staff",
    title: "Staff Profiles",
    description: "Import staff members with their department and employment details.",
    icon: Users,
    columns: [
      "name",
      "email",
      "department",
      "employment_type",
      "phone_number",
      "role",
      "reports_to",
      "emergency_contact_name",
      "emergency_contact_phone",
      "job_title",
      "employee_id",
    ],
    requiredColumns: ["name", "email", "department", "employment_type"],
    notes:
      "employment_type: full_time | part_time | contract | temporary. role: Staff | Team_Lead | Manager | PA | Admin.",
    sampleRows: [
      [
        "Alice Mensah",
        "alice.mensah@ndma.gov.gh",
        "Infrastructure",
        "full_time",
        "592-0000",
        "Staff",
        "staff-manager",
        "Grace Mensah",
        "592-1111",
        "Engineer",
        "EMP-0001",
      ],
      [
        "Bob Asante",
        "bob.asante@ndma.gov.gh",
        "Network Operations",
        "contract",
        "592-0001",
        "Team_Lead",
        "staff-manager",
        "Peter Asante",
        "592-1112",
        "Senior Engineer",
        "EMP-0002",
      ],
    ],
  },
  {
    id: "training",
    title: "Training Records",
    description: "Bulk import training completions with expiry dates and providers.",
    icon: GraduationCap,
    columns: [
      "staff_email",
      "course_title",
      "vendor",
      "course_type",
      "status",
      "start_date",
      "completion_date",
      "target_date",
      "material_type",
      "material_title",
      "reference_link",
      "notes",
    ],
    requiredColumns: ["staff_email", "course_title", "status"],
    notes:
      "Dates must be in YYYY-MM-DD format. course_type: Certification | Syllabus | Internship. status: Enrolled | In Progress | Completed | Failed.",
    sampleRows: [
      [
        "alice.mensah@ndma.gov.gh",
        "Fire Safety",
        "Safety Pro Ltd",
        "Certification",
        "Completed",
        "2025-01-10",
        "2025-01-15",
        "2026-01-15",
        "Book",
        "Official Guide",
        "https://example.com/guide",
        "Training completion example",
      ],
      [
        "bob.asante@ndma.gov.gh",
        "First Aid Level 2",
        "Red Cross",
        "Certification",
        "In Progress",
        "2025-03-01",
        "",
        "2027-03-10",
        "Checklist",
        "Onboarding Checklist",
        "https://example.com/checklist",
        "Recurring certification import",
      ],
    ],
  },
  {
    id: "contracts",
    title: "Contracts",
    description: "Import contract details including start/end dates and contract type.",
    icon: FileText,
    columns: [
      "staff_email",
      "contract_type",
      "start_date",
      "end_date",
      "renewal_status",
      "appraisal_period",
      "document_url",
      "notes",
    ],
    requiredColumns: ["staff_email", "contract_type", "start_date"],
    notes:
      "Dates must be in YYYY-MM-DD format. renewal_status: not_due | due_soon | letter_drafted | submitted_to_hr | renewed | not_renewing.",
    sampleRows: [
      [
        "alice.mensah@ndma.gov.gh",
        "permanent",
        "2023-01-01",
        "2026-12-31",
        "not_due",
        "Oct 2025 - Apr 2026",
        "https://example.invalid/contracts/alice.pdf",
        "Standard permanent contract",
      ],
      [
        "bob.asante@ndma.gov.gh",
        "fixed_term",
        "2025-01-01",
        "2025-12-31",
        "due_soon",
        "Oct 2025 - Apr 2026",
        "https://example.invalid/contracts/bob.pdf",
        "Renewal pending HR review",
      ],
    ],
  },
  {
    id: "work",
    title: "Work Update",
    description: "Import work items, recurring routines, and temporary tracker rows from the operations workbook.",
    icon: ClipboardList,
    columns: [
      "record_kind",
      "project_title",
      "task_title",
      "sub_task",
      "description",
      "status",
      "priority",
      "assigned_to",
      "department_code",
      "due_date",
      "period",
      "estimated_hours",
      "external_source",
      "external_link",
      "removal_date",
      "follow_up_date",
      "notes",
      "year",
    ],
    requiredColumns: ["record_kind", "project_title", "task_title", "status", "priority"],
    notes:
      "record_kind: work_item | routine | temporary. Use YYYY-MM-DD dates, and add year/period when the source workbook has weekly or monthly buckets.",
    sampleRows: [
      [
        "work_item",
        "Ops Stabilization",
        "Monthly Config Review",
        "",
        "Review monthly configuration and close out updates",
        "todo",
        "medium",
        "Engineer Name",
        "DCS",
        "2026-04-30",
        "",
        "4",
        "iTop",
        "https://example.invalid/ticket/123",
        "",
        "",
        "Imported from current work workbook",
        "2026",
      ],
      [
        "routine",
        "Ops Stabilization",
        "Monthly Health Check",
        "Servers",
        "Verify uptime and collect logs",
        "backlog",
        "low",
        "Engineer Name",
        "DCS",
        "2026-05-01",
        "Monthly",
        "2",
        "Teams",
        "https://example.invalid/teams/thread/456",
        "",
        "",
        "Recurring routine import",
        "2026",
      ],
    ],
  },
  {
    id: "operations_work_update",
    title: "Operations Workbook",
    description: "Import the full weekly operations tracker with sheet name, deadlines, overdue metrics, and external source links.",
    icon: ClipboardList,
    columns: [
      "record_type",
      "sheet_name",
      "year",
      "period",
      "task_assigned",
      "sub_task",
      "date_assigned",
      "details",
      "update_status",
      "deadline_or_overdue",
      "deadline_date",
      "weeks_overdue",
      "engineer",
      "source_system",
      "priority",
      "scheduled_date",
      "due_date",
      "folder",
      "estimated_hours",
      "follow_up_date",
      "notes",
    ],
    requiredColumns: ["record_type", "sheet_name", "task_assigned", "update_status", "priority"],
    notes:
      "This mirrors the legacy WorkUpdate workbook. Keep the original sheet name and use the sheet-derived year/period values from the source file.",
    sampleRows: [
      [
        "monthly_work",
        "0301",
        "2025",
        "Jan 2025",
        "Example task",
        "",
        "2025-01-03",
        "Example details",
        "In Progress",
        "2 Weeks",
        "2025-01-17",
        "",
        "Bheesham, Devon, Sachin",
        "Teams",
        "Medium",
        "",
        "",
        "",
        "",
        "",
        "Monthly work sheet import",
      ],
      [
        "temporary_change",
        "TemporaryTracker",
        "2026",
        "2026 H2",
        "Temporary network change",
        "",
        "2026-07-22",
        "Temporary change details",
        "Active",
        "",
        "2026-11-30",
        "",
        "Devon",
        "Temporary Tracker",
        "High",
        "",
        "",
        "",
        "",
        "2026-11-29",
        "Remove when complete",
      ],
    ],
  },
  {
    id: "leave",
    title: "Leave Records (2026)",
    description: "Import 2026 approved leave records for existing staff. Only 2026 dates accepted.",
    icon: CalendarOff,
    columns: ["staffEmail", "leaveTypeCode", "startDate", "endDate", "totalDays", "reason"],
    requiredColumns: ["staffEmail", "leaveTypeCode", "startDate", "endDate", "totalDays"],
    notes:
      "Dates MUST be 2026 (YYYY-MM-DD). leaveTypeCode: AL, SL, ML, STL. Staff must already exist — no new staff created.",
    sampleRows: [
      ["alice.mensah@ndma.gov.gh", "AL", "2026-03-03", "2026-03-07", "5", "Annual leave"],
      ["bob.asante@ndma.gov.gh", "SL", "2026-02-10", "2026-02-12", "3", ""],
    ],
  },
  {
    id: "ppe",
    title: "PPE & Tools",
    description: "Import PPE issuance records for staff.",
    icon: HardHat,
    columns: ["staffEmail", "ppeItemCode", "status", "issuedDate", "serialNumber", "size", "notes"],
    requiredColumns: ["staffEmail", "ppeItemCode", "issuedDate"],
    sampleRows: [
      ["joel@ndma.gov.gh", "laptop", "issued", "2024-01-15", "", "", ""],
      ["timothy@ndma.gov.gh", "mifi", "issued", "2024-01-15", "SN-2299", "", ""],
      ["richie@ndma.gov.gh", "safety_boots", "issued", "2024-02-01", "", "42", ""],
    ],
    notes:
      "ppeItemCode: long_boots, overalls, mousepad, safety_boots, bag, screwdriver, db9_rj45, db9_usb, monitor, hdmi_cable, laptop, mifi, cug_phone, cug_sim, ndma_shirts, usb_ethernet, umbrella. status: issued|returned|damaged|lost|replaced",
  },
  {
    id: "roster",
    title: "Scheduling & Rosters",
    description: "Import DCS on-call and NOC shift rows from the shared scheduling workbook.",
    icon: CalendarRange,
    columns: [
      "roster_type",
      "staff_name",
      "staff_email",
      "staff_id",
      "department",
      "year",
      "period",
      "shift_date",
      "shift_type",
      "start_time",
      "end_time",
      "notes",
      "source_file",
    ],
    requiredColumns: ["roster_type", "staff_email", "shift_date", "shift_type"],
    sampleRows: [
      [
        "dcs_on_call",
        "Example Staff",
        "example.staff@ndma.gov",
        "staff-001",
        "DCS",
        "2026",
        "2026-04",
        "2026-04-01",
        "On Call",
        "08:00",
        "16:00",
        "Weekly block",
        "category-zips/DCS.zip/on-call/PlannedOnCallRoster_20230123 (1).xlsx",
      ],
      [
        "noc_shifts",
        "Example Staff",
        "example.staff@ndma.gov",
        "staff-002",
        "NOC",
        "2026",
        "2026-04",
        "2026-04-01",
        "Day Shift",
        "07:00",
        "19:00",
        "Monthly grid",
        "category-zips/NOC.zip/shift-schedule/January_20260101_v01.xlsx",
      ],
    ],
    notes: "Use roster_type=dcs_on_call for the weekly DCS roster and roster_type=noc_shifts for the daily NOC grid.",
  },
  {
    id: "appraisals",
    title: "Appraisals",
    description: "Import appraisal headers, line items, notes, and workflow status for staff reviews.",
    icon: ClipboardCheck,
    columns: [
      "staff_email",
      "reviewer_email",
      "year",
      "period",
      "period_start",
      "period_end",
      "evaluation_type",
      "status",
      "total_score",
      "category",
      "criteria",
      "score",
      "comment",
      "note_type",
      "content",
    ],
    requiredColumns: ["staff_email", "year", "period", "period_start", "period_end", "status"],
    sampleRows: [
      [
        "example.staff@ndma.gov",
        "sachin@ndma.gov",
        "2026",
        "Oct 2025 - Apr 2026",
        "2025-10-01",
        "2026-04-30",
        "Standard",
        "Draft",
        "84",
        "Teamwork",
        "Communication",
        "4",
        "Example comment",
        "note",
        "Example appraisal note",
      ],
      [
        "example.staff@ndma.gov",
        "ataybia@ndma.gov",
        "2026",
        "Oct 2025 - Apr 2026",
        "2025-10-01",
        "2026-04-30",
        "Employee of the Month",
        "completed",
        "92",
        "Operations",
        "Delivery",
        "5",
        "Ready for HR",
        "summary",
        "Exported for HR",
      ],
    ],
    notes: "Repeat appraisal rows can share the same staff_email + year + period + evaluation_type; scores and notes are attached per row.",
  },
  {
    id: "calendar_events",
    title: "Calendar Events",
    description: "Import birthdays, training reminders, and manual reminders into the shared calendar.",
    icon: CalendarClock,
    columns: ["title", "event_type", "event_date", "staff_email", "notes", "source_file"],
    requiredColumns: ["title", "event_type", "event_date"],
    sampleRows: [
      ["Department Drill", "Event", "2026-04-21", "", "Department-wide reminder", "ops calendar"],
      ["Birthday - Example Staff", "Birthday", "2026-04-21", "example.staff@ndma.gov", "Auto-generated birthday reminder", "staff directory"],
      ["Training Reminder - Example Staff", "Training", "2026-04-28", "example.staff@ndma.gov", "Upcoming training target date", "training import"],
    ],
    notes: "event_type must be Birthday, Training, or Event. staff_email is optional for manual/global reminders.",
  },
  {
    id: "promotions",
    title: "Career Progression",
    description: "Import promotion letters and effective dates into the career progression timeline.",
    icon: ClipboardCheck,
    columns: ["staff_email", "promotion_date", "letter_date", "from_title", "to_title", "letter_url", "notes"],
    requiredColumns: ["staff_email", "promotion_date", "to_title"],
    sampleRows: [
      ["example.staff@ndma.gov", "2026-03-01", "2026-02-20", "Engineer I", "Engineer II", "https://example.invalid/letters/promo-2026.pdf", "Promoted after appraisal cycle"],
    ],
    notes: "Attach the scanned letter URL where available. Leave letter_date blank if the letter is missing.",
  },
  {
    id: "exam_schedule",
    title: "Exam Schedule",
    description: "Import certification exam schedules for staff members.",
    icon: GraduationCap,
    columns: ["staffEmail", "examName", "scheduledDate", "status"],
    requiredColumns: ["staffEmail", "examName", "scheduledDate"],
    sampleRows: [
      ["example.staff@ndma.gov", "CCNA", "2026-05-18", "scheduled"],
      ["example.staff@ndma.gov", "Huawei HCIA", "2026-06-11", "passed"],
    ],
    notes: "status: scheduled, passed, failed, cancelled, rescheduled.",
  },
  {
    id: "onboarding",
    title: "Onboarding Tasks",
    description: "Import standard onboarding checklist tasks for new hires.",
    icon: ClipboardCheck,
    columns: ["staff_email", "task_name", "category", "is_completed", "completed_at", "due_date"],
    requiredColumns: ["staff_email", "task_name", "category"],
    sampleRows: [
      ["new.hire@ndma.gov", "Create NDMA email account", "IT", "false", "", "2026-04-28"],
      ["new.hire@ndma.gov", "Collect ID badge", "HR & Admin", "true", "2026-04-24T09:00:00", "2026-04-24"],
    ],
    notes: "is_completed accepts true or false. completed_at can be left blank for incomplete tasks.",
  },
  {
    id: "policy",
    title: "Company Policies",
    description: "Import the NDMA policy library, starting with the Clean Desk Policy.",
    icon: FileText,
    columns: ["title", "content_text", "document_url", "last_updated"],
    requiredColumns: ["title", "content_text", "last_updated"],
    sampleRows: [
      ["Clean Desk Policy", "Policy text extracted from clean desk policy.docx", "https://example.invalid/clean-desk-policy.docx", "2026-04-21"],
    ],
    notes: "Use this for policy documents only; upload forms through the forms template.",
  },
  {
    id: "forms",
    title: "Internal Forms",
    description: "Import the NDMA internal forms catalog with category and file links.",
    icon: FileText,
    columns: ["title", "description", "category", "file_url", "uploaded_at"],
    requiredColumns: ["title", "category", "file_url"],
    sampleRows: [
      ["Internal Request Form", "Standard internal request form", "HR & Leave", "https://example.invalid/forms/internal-request-form.pdf", "2026-04-21T09:00:00"],
    ],
    notes: "category must be one of HR & Leave, Finance, Operations, IT, or General.",
  },
];

function getTargetAccent(targetId: ImportType) {
  switch (targetId) {
    case "staff":
      return {
        shell: "from-blue-500/10 via-blue-500/5 to-cyan-500/10",
        border: "border-blue-200/70 dark:border-blue-900/60",
        icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
      };
    case "training":
      return {
        shell: "from-indigo-500/10 via-sky-500/5 to-cyan-500/10",
        border: "border-indigo-200/70 dark:border-indigo-900/60",
        icon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
        chip: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
      };
    case "contracts":
      return {
        shell: "from-blue-500/10 via-cyan-500/5 to-indigo-500/10",
        border: "border-blue-200/70 dark:border-blue-900/60",
        icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
      };
    case "work":
    case "operations_work_update":
      return {
        shell: "from-slate-500/10 via-blue-500/5 to-indigo-500/10",
        border: "border-slate-200/70 dark:border-slate-800/80",
        icon: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
        chip: "bg-slate-50 text-slate-700 dark:bg-slate-950/40 dark:text-slate-300",
      };
    case "leave":
      return {
        shell: "from-rose-500/10 via-orange-500/5 to-amber-500/10",
        border: "border-rose-200/70 dark:border-rose-900/60",
        icon: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
        chip: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
      };
    default:
      return {
        shell: "from-blue-500/10 via-indigo-500/5 to-cyan-500/10",
        border: "border-blue-200/70 dark:border-blue-900/60",
        icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
      };
  }
}

// ── CSV template download ──────────────────────────────────────────────────

function encodeCsvCell(cell: string) {
  const escaped = cell.replaceAll('"', '""');
  return /[",\n]/.test(cell) ? `"${escaped}"` : cell;
}

function encodeCsvRow(row: string[]) {
  return row.map((cell) => encodeCsvCell(cell)).join(",");
}

function downloadTemplate(target: ImportTarget) {
  const header = encodeCsvRow(target.columns);
  const rows = target.sampleRows.map((row) => encodeCsvRow(row)).join("\n");
  const csv = `${header}\n${rows}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${target.id}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Step indicator ──────────────────────────────────────────────────────────

const STEPS = ["Select Type", "Upload File", "Preview & Validate", "Import"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`size-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                i < current
                  ? "bg-primary border-primary text-primary-foreground"
                  : i === current
                    ? "border-primary text-primary bg-background"
                    : "border-muted text-muted-foreground bg-background"
              }`}
            >
              {i < current ? <CheckCircle className="size-4" /> : i + 1}
            </div>
            <span
              className={`text-xs whitespace-nowrap ${
                i === current ? "text-foreground font-medium" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`h-px w-12 sm:w-20 mx-1 mb-4 transition-colors ${
                i < current ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    pending: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium capitalize ${map[status] ?? map.pending}`}
    >
      {status}
    </span>
  );
}

// ── CSV parser ─────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(raw: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows: ParsedRow[] = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: ParsedRow = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

// ── Validator ───────────────────────────────────────────────────────────────

function validateRows(rows: ParsedRow[], target: ImportTarget): ValidatedRow[] {
  return rows.map((row) => {
    const errors: string[] = [];
    for (const col of target.requiredColumns) {
      if (!row[col] || row[col].trim() === "") {
        errors.push(`Missing required field: ${col}`);
      }
    }
    return { data: row, errors };
  });
}

// ── Import History tab ─────────────────────────────────────────────────────

function ImportHistory() {
  const { data: jobs, isLoading } = useQuery(
    orpc.import.getHistory.queryOptions({ input: { limit: 30 } }),
  );

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Loading import history…
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <History className="size-10 opacity-30" />
        <p className="text-sm">No imports yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">Success</TableHead>
            <TableHead className="text-right">Errors</TableHead>
            <TableHead>Imported by</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-medium capitalize text-sm">
                {job.importType.replace("_", " ")}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                {job.fileName ?? "—"}
              </TableCell>
              <TableCell>
                <StatusBadge status={job.status} />
              </TableCell>
              <TableCell className="text-right text-sm">{job.totalRows ?? 0}</TableCell>
              <TableCell className="text-right text-sm text-blue-600 dark:text-blue-400">
                {job.successCount ?? 0}
              </TableCell>
              <TableCell className="text-right text-sm text-red-600 dark:text-red-400">
                {job.errorCount ?? 0}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {job.createdBy?.name ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(job.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

function ImportPage() {
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState<ImportTarget | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [importResult, setImportResult] = useState<{
    successCount: number;
    errorCount: number;
    status: string;
    errors?: { row: number; field?: string; message: string }[] | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation(orpc.import.execute.mutationOptions());

  // ── Step 1: select type ────────────────────────────────────────────────

  const handleTypeSelect = (target: ImportTarget) => {
    setSelectedType(target);
    setParsedHeaders([]);
    setParsedRows([]);
    setValidatedRows([]);
    setFileName("");
    setImportResult(null);
  };

  // ── Step 2: file handling ──────────────────────────────────────────────

  const processCsv = useCallback((content: string, name: string) => {
    const { headers, rows } = parseCsv(content);
    setFileName(name);
    setParsedHeaders(headers);
    setParsedRows(rows);
  }, []);

  const handleFileChange = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      processCsv(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      handleFileChange(file);
    } else {
      toast.error("Please drop a CSV file");
    }
  };

  const loadSampleData = () => {
    if (!selectedType) return;
    const header = encodeCsvRow(selectedType.columns);
    const rows = selectedType.sampleRows.map((r) => encodeCsvRow(r)).join("\n");
    processCsv(`${header}\n${rows}`, "sample-data.csv");
  };

  // ── Step 3: validate ───────────────────────────────────────────────────

  const handleProceedToValidate = () => {
    if (!selectedType) return;
    setValidatedRows(validateRows(parsedRows, selectedType));
    setStep(2);
  };

  // ── Step 4: import ─────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!selectedType) return;

    const validRows = validatedRows
      .filter((r) => r.errors.length === 0)
      .map((r) => r.data);

    try {
      const result = await importMutation.mutateAsync({
        importType: selectedType.id,
        fileName: fileName || undefined,
        rows: validRows,
      });

      setImportResult({
        successCount: result.successCount ?? 0,
        errorCount: result.errorCount ?? 0,
        status: result.status,
        errors: result.errors as { row: number; field?: string; message: string }[] | null,
      });

      if (result.status === "completed") {
        toast.success(`Imported ${result.successCount} rows successfully`);
      } else if (result.status === "partial") {
        toast.warning(
          `Partial import: ${result.successCount} succeeded, ${result.errorCount} failed`,
        );
      } else {
        toast.error("Import failed — check the error details below");
      }

      setStep(4);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const resetWizard = () => {
    setStep(0);
    setSelectedType(null);
    setParsedHeaders([]);
    setParsedRows([]);
    setValidatedRows([]);
    setFileName("");
    setImportResult(null);
    importMutation.reset();
  };

  const validCount = validatedRows.filter((r) => r.errors.length === 0).length;
  const errorCount = validatedRows.filter((r) => r.errors.length > 0).length;
  const allValid = validatedRows.length > 0 && errorCount === 0;

  const getMissingColumns = () => {
    if (!selectedType || parsedHeaders.length === 0) return [];
    return selectedType.requiredColumns.filter((col) => !parsedHeaders.includes(col));
  };
  const missingColumns = getMissingColumns();

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Upload className="size-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium">Import Data</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <section className="mb-6 overflow-hidden rounded-3xl border border-blue-200/60 bg-gradient-to-br from-blue-50 via-background to-indigo-50 shadow-sm dark:border-blue-900/50 dark:from-blue-950/30 dark:via-background dark:to-indigo-950/20">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_0.9fr] lg:p-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-100/80 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-300">
                <Upload className="size-3.5" />
                Historical bulk imports
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-blue-950 dark:text-blue-50 md:text-3xl">
                  Import Data
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                  Bulk import staff, training records, contracts, work items, and historical workbook rows from CSV.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  Year / period aware
                </span>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                  Notes preserved
                </span>
                <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                  DCS / NOC separation
                </span>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  CSV templates included
                </span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-blue-200/70 bg-white/80 p-4 shadow-sm dark:border-blue-900/50 dark:bg-slate-950/70">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-300">
                  Source of truth
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Workbook-driven imports with historical backfill across leave, work, training, appraisal, and attendance.
                </p>
              </div>
              <div className="rounded-2xl border border-indigo-200/70 bg-white/80 p-4 shadow-sm dark:border-indigo-900/50 dark:bg-slate-950/70">
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                  Safe preview
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Validate headers and rows before committing anything to the database.
                </p>
              </div>
              <div className="rounded-2xl border border-blue-200/70 bg-white/80 p-4 shadow-sm dark:border-blue-900/50 dark:bg-slate-950/70">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-300">
                  Source notes
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Comments, reasons, and legacy labels map forward instead of being dropped.
                </p>
              </div>
            </div>
          </div>
        </section>
        <Tabs defaultValue="wizard">
          <TabsList className="mb-6 bg-blue-50/80 text-blue-950 shadow-sm dark:bg-blue-950/30 dark:text-blue-50">
            <TabsTrigger value="wizard">
              <Upload className="size-3.5 mr-1.5" />
              Import Wizard
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="size-3.5 mr-1.5" />
              Import History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wizard">
            {/* Only show step indicator while in wizard steps 0–3 */}
            {step < 4 && <StepIndicator current={step} />}

            {/* ── Step 0: Select type ── */}
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold">What would you like to import?</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {IMPORT_TARGETS.map((target) => (
                    <Card
                      key={target.id}
                      onClick={() => handleTypeSelect(target)}
                      className={`cursor-pointer border bg-blue-50/70 transition-all hover:-translate-y-0.5 hover:border-blue-400/60 hover:shadow-md dark:bg-blue-950/20 ${
                        selectedType?.id === target.id
                          ? "border-blue-500 ring-2 ring-blue-400/30"
                          : ""
                      }`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <div className="rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            <target.icon className="size-4" />
                          </div>
                          <CardTitle className="text-sm">{target.title}</CardTitle>
                          {selectedType?.id === target.id && (
                            <CheckCircle className="ml-auto size-4 text-blue-600 dark:text-blue-300" />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="text-xs mb-2">
                          {target.description}
                        </CardDescription>
                        <p className="text-xs text-muted-foreground mb-1.5">Required columns:</p>
                        <div className="flex flex-wrap gap-1">
                          {target.columns.map((col) => (
                            <span
                              key={col}
                              className="rounded-lg bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                            >
                              {col}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 italic">
                          {target.notes}
                        </p>
                        {/* Download template link — stopPropagation prevents card selection */}
                        <div className="mt-3 border-t border-dashed border-blue-200/70 pt-3 dark:border-blue-900/60">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadTemplate(target);
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 transition-colors hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
                          >
                            <Download className="size-3" />
                            Download CSV Template
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="flex justify-end mt-6">
                  <Button disabled={!selectedType} onClick={() => setStep(1)}>
                    Next
                    <ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 1: Upload file ── */}
            {step === 1 && selectedType && (
              <div className="space-y-4 max-w-xl">
                <div className="flex items-center gap-2 mb-2">
                  <selectedType.icon className="size-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Importing: {selectedType.title}</span>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <FileSpreadsheet className="size-10 text-muted-foreground mx-auto mb-3" />
                  {fileName ? (
                    <div>
                      <p className="text-sm font-medium text-foreground">{fileName}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {parsedRows.length} data rows found
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">Drop your CSV file here</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        or click to browse — .csv files only
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileChange(file);
                    }}
                  />
                </div>

                <div className="flex items-center justify-center gap-4 text-xs">
                  <button
                    onClick={loadSampleData}
                    className="text-primary underline-offset-2 hover:underline"
                    type="button"
                  >
                    Use sample data (2 example rows)
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={() => downloadTemplate(selectedType)}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Download className="size-3" />
                    Need the template? Download it
                  </button>
                </div>

                {parsedRows.length > 0 && (
                  <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">{fileName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {parsedRows.length} data rows — headers: {parsedHeaders.join(", ")}
                    </p>
                    {missingColumns.length > 0 && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                        <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                        <span>Missing required columns: {missingColumns.join(", ")}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setStep(0)}>
                    <ChevronLeft className="size-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    disabled={parsedRows.length === 0 || missingColumns.length > 0}
                    onClick={handleProceedToValidate}
                  >
                    Preview & Validate
                    <ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 2: Preview & Validate ── */}
            {step === 2 && selectedType && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Preview & Validate</h2>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      {validCount} rows valid
                    </span>
                    {errorCount > 0 && (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {errorCount} rows with errors
                      </span>
                    )}
                  </div>
                </div>

                {!allValid && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    <AlertCircle className="size-4 shrink-0" />
                    Fix all row errors before importing. Required fields must not be empty.
                  </div>
                )}

                {allValid && (
                  <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
                    <CheckCircle className="size-4 shrink-0" />
                    All {validCount} rows passed validation. Ready to import.
                  </div>
                )}

                <div className="rounded-xl border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        {parsedHeaders.map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validatedRows.slice(0, 5).map((row, i) => (
                        <TableRow
                          key={i}
                          className={
                            row.errors.length > 0 ? "bg-red-50/50 dark:bg-red-950/10" : ""
                          }
                        >
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          {parsedHeaders.map((h) => (
                            <TableCell key={h} className="text-sm">
                              {row.data[h] || (
                                <span className="text-muted-foreground italic">—</span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell>
                            {row.errors.length === 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                <CheckCircle className="size-3" />
                                Valid
                              </span>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {row.errors.map((err, j) => (
                                  <span
                                    key={j}
                                    className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                  >
                                    <AlertCircle className="size-3 shrink-0" />
                                    {err}
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {validatedRows.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Showing first 5 of {validatedRows.length} rows
                  </p>
                )}

                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ChevronLeft className="size-4 mr-1" />
                    Back
                  </Button>
                  <Button disabled={!allValid} onClick={() => setStep(3)}>
                    Proceed to Import
                    <ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 3: Confirm Import ── */}
            {step === 3 && selectedType && (
              <div className="space-y-4 max-w-lg">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Confirm Import</CardTitle>
                    <CardDescription>
                      You are about to import{" "}
                      <span className="font-semibold text-foreground">{validCount} rows</span> of{" "}
                      <span className="font-semibold text-foreground">{selectedType.title}</span>{" "}
                      data.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl bg-muted/50 p-3 text-sm space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Import type</span>
                        <span className="font-medium">{selectedType.title}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total rows</span>
                        <span className="font-medium">{validatedRows.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valid rows</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {validCount}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Source file</span>
                        <span className="font-medium text-xs truncate max-w-[160px]">
                          {fileName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                      This action will create new records. Duplicate emails will be skipped with an
                      error.
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="size-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importMutation.isPending}
                  >
                    {importMutation.isPending ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Importing…
                      </>
                    ) : (
                      <>
                        <Upload className="size-4 mr-1" />
                        Confirm Import
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 4: Result ── */}
            {step === 4 && importResult && selectedType && (
              <Card className="max-w-lg">
                <CardContent className="py-10 text-center">
                  {importResult.status === "completed" ? (
                    <CheckCircle className="size-12 text-blue-500 mx-auto mb-4" />
                  ) : importResult.status === "partial" ? (
                    <AlertCircle className="size-12 text-amber-500 mx-auto mb-4" />
                  ) : (
                    <XCircle className="size-12 text-red-500 mx-auto mb-4" />
                  )}

                  <h2 className="text-lg font-semibold mb-1">
                    Import{" "}
                    {importResult.status === "completed"
                      ? "Complete"
                      : importResult.status === "partial"
                        ? "Partially Complete"
                        : "Failed"}
                  </h2>

                  <div className="text-sm text-muted-foreground mb-4 space-y-1">
                    <p>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {importResult.successCount}
                      </span>{" "}
                      rows imported successfully
                    </p>
                    {importResult.errorCount > 0 && (
                      <p>
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {importResult.errorCount}
                        </span>{" "}
                        rows failed
                      </p>
                    )}
                  </div>

                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="text-left rounded-xl border bg-red-50 dark:bg-red-950/20 p-3 mb-4 space-y-1.5 max-h-40 overflow-y-auto">
                      {importResult.errors.slice(0, 10).map((e, i) => (
                        <p key={i} className="text-xs text-red-700 dark:text-red-400">
                          Row {e.row}
                          {e.field ? ` (${e.field})` : ""}: {e.message}
                        </p>
                      ))}
                      {importResult.errors.length > 10 && (
                        <p className="text-xs text-muted-foreground">
                          …and {importResult.errors.length - 10} more errors
                        </p>
                      )}
                    </div>
                  )}

                  <Button onClick={resetWizard}>Import Another</Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            <ImportHistory />
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
