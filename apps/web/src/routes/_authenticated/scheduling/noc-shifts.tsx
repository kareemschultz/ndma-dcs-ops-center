// /scheduling/noc-shifts — NOC Shift Grid
//
// Features:
//   • 11 shift types matching DB enum (Day Shift / Night Shift / Swing Shift / Off / AL / SL / ML / Training / Training Half Day / Custom / Outreach)
//   • Click chip → opens Popover with all 11 shift types as buttons (direct pick, no cycling)
//   • Hover chip → reveals × quick-clear button (set to Off without opening picker)
//   • Custom / Outreach → opens note dialog before saving
//   • Notes indicator dot on chip when a note exists; title tooltip shows the note text
//   • My Shifts toggle to filter grid to logged-in user only
//   • Month navigation: ← / → arrows + any-month dropdown
//   • Staff name search filter (client-side)
//   • Weekend column highlighting; today column blue highlight
//   • Month summary row per staff: D / N / S counts
//   • Excel import (SheetJS) → bulk-set via bulkSet mutation
//   • PDF export (jsPDF + autotable) landscape grid

import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { format, parseISO } from "date-fns";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ndma-dcs-staff-portal/ui/components/dialog";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ndma-dcs-staff-portal/ui/components/popover";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { SchedulingSubNav } from "@/components/layout/scheduling-sub-nav";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/scheduling/noc-shifts")({
  component: NocShiftsPage,
});

// ── Shift type definitions ─────────────────────────────────────────────────────

const SHIFT_TYPES = [
  "Day Shift",
  "Night Shift",
  "Swing Shift",
  "Off",
  "Annual Leave",
  "Sick Leave",
  "Maternity Leave",
  "Training",
  "Training Half Day",
  "Outreach",
  "Custom",
] as const;

type ShiftType = (typeof SHIFT_TYPES)[number];


interface ChipConfig {
  short: string;
  className: string;
  pdfColor: [number, number, number];
  legendLabel: string;
}

const SHIFT_CHIP: Record<ShiftType, ChipConfig> = {
  "Day Shift": {
    short: "D",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    pdfColor: [219, 234, 254],
    legendLabel: "Day Shift",
  },
  "Night Shift": {
    short: "N",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
    pdfColor: [237, 233, 254],
    legendLabel: "Night Shift",
  },
  "Swing Shift": {
    short: "S",
    className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
    pdfColor: [224, 231, 255],
    legendLabel: "Swing Shift",
  },
  "Off": {
    short: "—",
    className: "bg-muted text-muted-foreground",
    pdfColor: [243, 244, 246],
    legendLabel: "Off",
  },
  "Annual Leave": {
    short: "AL",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    pdfColor: [254, 243, 199],
    legendLabel: "Annual Leave",
  },
  "Sick Leave": {
    short: "SL",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    pdfColor: [254, 226, 226],
    legendLabel: "Sick Leave",
  },
  "Maternity Leave": {
    short: "ML",
    className: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
    pdfColor: [252, 231, 243],
    legendLabel: "Maternity Leave",
  },
  "Training": {
    short: "TR",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
    pdfColor: [204, 251, 241],
    legendLabel: "Training",
  },
  "Training Half Day": {
    short: "T/D",
    className: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
    pdfColor: [240, 253, 250],
    legendLabel: "Training Half Day",
  },
  "Custom": {
    short: "C",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
    pdfColor: [226, 232, 240],
    legendLabel: "Custom",
  },
  "Outreach": {
    short: "OR",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    pdfColor: [255, 237, 213],
    legendLabel: "Outreach",
  },
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

// ── Excel import: staff name → staffId mapping ────────────────────────────────

const STAFF_NAME_MAP: Record<string, string> = {
  "dennis southwell": "sp-dennis",
  "ganesh mansram": "sp-ganesh",
  "stefan hopkinson": "sp-stefan",
  "ayeldre christie": "sp-ayeldre",
  "shameer ally": "sp-shameer",
  "keoma grant": "sp-keoma",
  "asif khan": "sp-asif",
  "wynonna watson": "sp-wynonna",
  "randolph morrison": "sp-morrison",
  "joshua deygoo": "sp-joshua",
};

// Excel shift code → DB shift type
function parseExcelShiftCode(raw: unknown): ShiftType | null {
  if (raw === null || raw === undefined || raw === "" || raw === "-") return null;
  const s = String(raw).trim();
  if (!s || s === "-") return null;

  const upper = s.toUpperCase();

  if (upper === "D") return "Day Shift";
  if (upper === "N") return "Night Shift";
  if (upper === "S") return "Swing Shift";
  if (upper === "AL") return "Annual Leave";
  if (upper === "ML") return "Maternity Leave";
  if (upper === "T/D") return "Training Half Day";
  if (upper === "T") return "Training";
  if (upper === "OUT REACH" || upper === "OUTREACH" || upper === "OR") return "Outreach";
  if (upper === "SICK" || upper === "SL") return "Sick Leave";
  // Single letter spelling ANNUAL LEAVE
  if (["A", "U", "L", "E", "V"].includes(upper)) return "Annual Leave";

  return "Custom";
}

// ── Shift cell chip with popover picker ───────────────────────────────────────
//
// Click the chip → Popover opens showing all 11 shift types as button grid.
// Hover chip → reveals × quick-clear button (bypasses the picker).
// Custom / Outreach → parent handles note dialog after onSelect is called.

function ShiftChip({
  shift,
  notes,
  pending,
  onSelect,
  onClear,
}: {
  shift: ShiftType | undefined;
  notes?: string | null;
  pending: boolean;
  onSelect: (type: ShiftType) => void;
  onClear: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const config = shift ? SHIFT_CHIP[shift] : SHIFT_CHIP["Off"];
  const isOff = !shift || shift === "Off";
  const hasNote = !!notes;

  function pick(type: ShiftType) {
    setOpen(false);
    onSelect(type);
  }

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={pending}
          title={notes ? `${shift}: ${notes}` : (shift ?? "Off")}
          className={[
            "relative flex h-7 w-7 items-center justify-center rounded-md font-mono text-[10px] font-bold transition-all",
            "hover:opacity-80 hover:ring-1 hover:ring-current/40 active:scale-95 disabled:opacity-50",
            open ? "ring-2 ring-current/50" : "",
            config.className,
          ].join(" ")}
        >
          {config.short}
          {hasNote && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-background bg-current opacity-70"
            />
          )}
        </PopoverTrigger>

        <PopoverContent className="w-52 p-2" side="bottom" align="center">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Set Shift Type
          </p>
          <div className="grid grid-cols-3 gap-1">
            {SHIFT_TYPES.map((t) => {
              const c = SHIFT_CHIP[t];
              const isCurrent = t === shift;
              return (
                <button
                  key={t}
                  onClick={() => pick(t)}
                  className={[
                    "flex flex-col items-center rounded-lg px-1 py-2 text-center transition-all",
                    "hover:opacity-75 hover:scale-[1.06] active:scale-95",
                    c.className,
                    isCurrent ? "ring-2 ring-current ring-offset-1 opacity-90" : "",
                  ].join(" ")}
                >
                  <span className="font-mono text-[11px] font-bold leading-none">{c.short}</span>
                  <span className="mt-0.5 text-[8px] leading-tight opacity-80">{c.legendLabel}</span>
                </button>
              );
            })}
          </div>
          {!isOff && (
            <button
              onClick={() => { setOpen(false); onClear(); }}
              className="mt-2 w-full rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
            >
              ✕ Clear (set to Off)
            </button>
          )}
        </PopoverContent>
      </Popover>

      {/* Quick-clear on hover — bypasses picker */}
      {hovered && !open && !isOff && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          disabled={pending}
          title="Clear shift (set to Off)"
          className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          <X className="h-2 w-2" />
        </button>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function NocShiftsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [staffFilter, setStaffFilter] = useState("");
  const [myShiftsMode, setMyShiftsMode] = useState(false);

  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  // Custom note dialog
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [pendingCustom, setPendingCustom] = useState<{ staffId: string; date: string; shiftType: ShiftType } | null>(null);
  const [customNote, setCustomNote] = useState("");

  // Swap request dialog
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapFromDate, setSwapFromDate] = useState("");
  const [swapToDate, setSwapToDate] = useState("");
  const [swapWithStaffId, setSwapWithStaffId] = useState("");
  const [swapReason, setSwapReason] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: shifts, isLoading } = useQuery(
    orpc.scheduling.nocShifts.list.queryOptions({ input: { year, month } }),
  );

  const { data: staffData } = useQuery(
    orpc.staff.list.queryOptions({ input: { limit: 200, offset: 0 } }),
  );

  // ── Mutations ────────────────────────────────────────────────────────────────

  const mutation = useMutation(
    orpc.scheduling.nocShifts.bulkSet.mutationOptions({
      onSuccess: () => {
        toast.success("Shift saved");
        queryClient.invalidateQueries({ queryKey: orpc.scheduling.nocShifts.list.key() });
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to save"),
    }),
  );

  // ── Derived data ─────────────────────────────────────────────────────────────

  const shiftMap: Record<string, Record<number, { type: ShiftType; notes?: string | null }>> = {};
  const staffNames: Record<string, string> = {};

  for (const s of shifts ?? []) {
    const day = parseISO(s.shiftDate).getDate();
    if (!shiftMap[s.staffId]) shiftMap[s.staffId] = {};
    shiftMap[s.staffId][day] = { type: s.shiftType as ShiftType, notes: s.notes };
    if (s.staffProfile?.user?.name) staffNames[s.staffId] = s.staffProfile.user.name;
  }

  // Supplement names from staff list query
  for (const sp of staffData ?? []) {
    if (!staffNames[sp.id]) staffNames[sp.id] = sp.user?.name ?? sp.id;
  }

  const allStaffIds = Object.keys(shiftMap);

  // Find current user's staff profile ID
  const myStaffId = (staffData ?? []).find(
    (sp: { id: string; userId?: string | null; user?: { id?: string | null } | null }) =>
      sp.userId === currentUserId || sp.user?.id === currentUserId
  )?.id ?? null;

  const filteredStaffIds = (() => {
    // "My Shifts" mode — show only the logged-in user's row
    if (myShiftsMode && myStaffId) return allStaffIds.filter((id) => id === myStaffId);
    // Name search filter
    if (staffFilter.trim())
      return allStaffIds.filter((id) =>
        (staffNames[id] ?? id).toLowerCase().includes(staffFilter.toLowerCase()),
      );
    return allStaffIds;
  })();

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    const dow = date.toLocaleDateString("en-GB", { weekday: "short" });
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekStart = dayOfWeek === 1 && i > 0;
    const isToday = date.toDateString() === now.toDateString();
    return { day: i + 1, dow, weekStart, isWeekend, isToday };
  });

  // ── Navigation helpers ───────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  // ── Cell helpers ─────────────────────────────────────────────────────────────

  function makeDateStr(day: number) {
    const monthStr = String(month).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    return `${year}-${monthStr}-${dayStr}`;
  }

  function saveShift(staffId: string, dateStr: string, shiftType: ShiftType, notes?: string | null) {
    mutation.mutate({
      entries: [{ staffId, shiftDate: dateStr, shiftType, notes: notes ?? null }],
    });
  }

  // Called when a shift type is chosen in the picker popover
  function handleCellSelect(staffId: string, day: number, selectedType: ShiftType) {
    const currentShift = shiftMap[staffId]?.[day];
    const dateStr = makeDateStr(day);

    // Custom or Outreach always opens the note dialog (pre-fill existing note if re-editing)
    if (selectedType === "Custom" || selectedType === "Outreach") {
      const existingNote = currentShift?.type === selectedType ? (currentShift?.notes ?? "") : "";
      setPendingCustom({ staffId, date: dateStr, shiftType: selectedType });
      setCustomNote(existingNote);
      setCustomDialogOpen(true);
      return;
    }

    saveShift(staffId, dateStr, selectedType);
  }

  function handleClearCell(staffId: string, day: number) {
    saveShift(staffId, makeDateStr(day), "Off");
  }

  function handleCustomConfirm() {
    if (!pendingCustom) return;
    saveShift(pendingCustom.staffId, pendingCustom.date, pendingCustom.shiftType, customNote.trim() || null);
    setCustomDialogOpen(false);
    setPendingCustom(null);
    setCustomNote("");
  }

  function handleCustomCancel() {
    setCustomDialogOpen(false);
    setPendingCustom(null);
    setCustomNote("");
  }

  // ── Swap submit ──────────────────────────────────────────────────────────────

  function handleSwapSubmit() {
    if (!swapFromDate || !swapWithStaffId || !swapToDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    const callerStaffId = allStaffIds[0];
    if (callerStaffId) {
      const fromDay = Number(swapFromDate.split("-")[2]);
      const toDay = Number(swapToDate.split("-")[2]);
      const requesterShift = shiftMap[callerStaffId]?.[fromDay]?.type ?? "Off";
      const targetShift = shiftMap[swapWithStaffId]?.[toDay]?.type ?? "Off";
      mutation.mutate({
        entries: [
          { staffId: callerStaffId, shiftDate: swapFromDate, shiftType: targetShift },
          { staffId: swapWithStaffId, shiftDate: swapToDate, shiftType: requesterShift },
        ],
      });
    }
    toast.success("Swap request submitted");
    setSwapDialogOpen(false);
    setSwapFromDate("");
    setSwapToDate("");
    setSwapWithStaffId("");
    setSwapReason("");
  }

  // ── Summary per staff ────────────────────────────────────────────────────────

  function summarise(staffId: string) {
    let D = 0, N = 0, S = 0, Leave = 0, Off = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const t = shiftMap[staffId]?.[d]?.type;
      if (t === "Day Shift") D++;
      else if (t === "Night Shift") N++;
      else if (t === "Swing Shift") S++;
      else if (t === "Annual Leave" || t === "Sick Leave" || t === "Maternity Leave") Leave++;
      else Off++;
    }
    return { D, N, S, Leave, Off };
  }

  // ── Excel import ─────────────────────────────────────────────────────────────

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) {
          toast.error("Empty workbook");
          return;
        }

        // Read as array of arrays (raw values)
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

        // Row index 1 (0-based) = row 2 in Excel = day numbers starting from col B (index 1)
        const dayRow = rows[1] ?? [];
        // Map column index → day number
        const colToDay: Record<number, number> = {};
        for (let c = 1; c < dayRow.length; c++) {
          const v = dayRow[c];
          const num = typeof v === "number" ? v : Number(v);
          if (!isNaN(num) && num >= 1 && num <= 31) {
            colToDay[c] = num;
          }
        }

        // Rows 4+ (0-based index 4) = data rows; col 0 = staff name
        const entries: { staffId: string; shiftDate: string; shiftType: ShiftType }[] = [];
        let skipped = 0;

        for (let r = 4; r < rows.length; r++) {
          const row = rows[r];
          if (!row) continue;
          const rawName = String(row[0] ?? "").trim();
          if (!rawName) continue;
          const staffId = STAFF_NAME_MAP[rawName.toLowerCase()];
          if (!staffId) { skipped++; continue; }

          for (const [colStr, day] of Object.entries(colToDay)) {
            const col = Number(colStr);
            const cellVal = row[col];
            const shiftType = parseExcelShiftCode(cellVal);
            if (!shiftType || shiftType === "Off") continue;

            const monthStr = String(month).padStart(2, "0");
            const dayStr = String(day).padStart(2, "0");
            entries.push({
              staffId,
              shiftDate: `${year}-${monthStr}-${dayStr}`,
              shiftType,
            });
          }
        }

        if (entries.length === 0) {
          toast.error("No recognisable shift entries found in file");
          return;
        }

        // Batch into chunks of 50
        const CHUNK = 50;
        let done = 0;
        const chunks: typeof entries[] = [];
        for (let i = 0; i < entries.length; i += CHUNK) {
          chunks.push(entries.slice(i, i + CHUNK));
        }

        function sendNext(idx: number) {
          const chunk = chunks[idx];
          if (!chunk) {
            toast.success(`Imported ${done} shifts${skipped > 0 ? ` (${skipped} unknown staff skipped)` : ""}`);
            queryClient.invalidateQueries({ queryKey: orpc.scheduling.nocShifts.list.key() });
            return;
          }
          mutation.mutate(
            { entries: chunk },
            {
              onSuccess: () => {
                done += chunk.length;
                sendNext(idx + 1);
              },
              onError: (err: Error) => toast.error(`Import error: ${err.message}`),
            },
          );
        }

        sendNext(0);
      } catch (err) {
        toast.error(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsBinaryString(file);

    // Reset so the same file can be re-imported
    e.target.value = "";
  }

  // ── PDF export ───────────────────────────────────────────────────────────────

  function handleExportPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const BRAND_BLUE: [number, number, number] = [26, 86, 219];
    const BRAND_MID: [number, number, number] = [75, 85, 99];
    const BRAND_DARK: [number, number, number] = [17, 24, 39];

    // Header strip
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(0, 0, 297, 14, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text("NATIONAL DATA MANAGEMENT AUTHORITY · DATA CENTRE SERVICES", 8, 6);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("DCS Ops Center", 8, 12);

    // Title
    doc.setTextColor(...BRAND_DARK);
    doc.setFontSize(14);
    doc.text(`NOC Shift Grid — ${MONTHS[month - 1]} ${year}`, 8, 24);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND_MID);
    doc.text(`Exported ${format(now, "d MMM yyyy, HH:mm")} · Generated by DCS Ops Center`, 8, 30);

    // Build table
    const dayHeaders = days.map((d) => `${d.dow[0]}\n${d.day}`);
    const head = [["Staff", ...dayHeaders, "D", "N", "S"]];

    const body = filteredStaffIds.map((staffId) => {
      const name = staffNames[staffId] ?? staffId;
      const cells = days.map((d) => {
        const t = shiftMap[staffId]?.[d.day]?.type;
        return t ? (SHIFT_CHIP[t]?.short ?? "") : "";
      });
      const sum = summarise(staffId);
      return [name, ...cells, String(sum.D), String(sum.N), String(sum.S)];
    });

    autoTable(doc, {
      startY: 34,
      head,
      body,
      theme: "grid",
      headStyles: {
        fillColor: BRAND_BLUE,
        fontSize: 6,
        fontStyle: "bold",
        halign: "center",
        cellPadding: 1,
      },
      styles: { fontSize: 6, cellPadding: 1, halign: "center", overflow: "ellipsize" },
      columnStyles: {
        0: { halign: "left", cellWidth: 30, fontStyle: "bold" },
      },
      // Color individual cells by shift type
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index === 0) return;
        const text = String(data.cell.raw ?? "");
        // Find shift type by short code
        const entry = Object.entries(SHIFT_CHIP).find(([, v]) => v.short === text);
        if (entry) {
          const color = entry[1].pdfColor;
          data.cell.styles.fillColor = color;
        }
      },
      margin: { left: 8, right: 8 },
    });

    // Footer
    const pages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...BRAND_MID);
      doc.text(`Generated by DCS Ops Center • ${format(now, "d MMM yyyy")} • Page ${i} of ${pages}`, 8, 207);
    }

    doc.save(`NOC_Shift_Grid_${MONTHS[month - 1]}_${year}.pdf`);
    toast.success("PDF exported");
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">NOC Shift Grid</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="p-0">
        <SchedulingSubNav activeView="noc" />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="space-y-0.5">
            <h1 className="text-xl font-bold tracking-tight">NOC Shift Grid</h1>
            <p className="text-sm text-muted-foreground">
              Click any cell to pick a shift type. Hover a cell for the quick-clear button.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* My Shifts toggle — only shown when the user has a NOC staff profile */}
            {myStaffId && allStaffIds.includes(myStaffId) && (
              <Button
                size="sm"
                variant={myShiftsMode ? "default" : "outline"}
                onClick={() => { setMyShiftsMode((v) => !v); setStaffFilter(""); }}
                className="gap-1.5"
              >
                <User className="h-3.5 w-3.5" />
                My Shifts
              </Button>
            )}

            {/* Actions */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSwapDialogOpen(true)}
              className="gap-1.5"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Request Swap
            </Button>

            {/* Hidden file input for Excel import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileImport}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={mutation.isPending}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Import Excel
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </Button>

            {/* Month navigation */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[year - 2, year - 1, year, year + 1, year + 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Legend
          </span>
          {SHIFT_TYPES.map((t) => {
            const c = SHIFT_CHIP[t];
            return (
              <span
                key={t}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.className}`}
              >
                <span className="font-mono font-bold">{c.short}</span>
                {c.legendLabel}
              </span>
            );
          })}
        </div>

        {/* Staff filter */}
        <div className="px-6 pb-3">
          <div className="relative w-60">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by name…"
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <Skeleton className="mx-6 mb-6 h-64 w-auto" />
        ) : allStaffIds.length === 0 ? (
          <div className="mx-6 mb-6 flex flex-col items-center rounded-lg border border-dashed py-16 text-center">
            <CalendarDays className="mb-3 size-10 opacity-30" />
            <p className="font-medium">
              No shift data for {MONTHS[month - 1]} {year}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Import an Excel file or click a staff cell once data has been added via the API.
            </p>
          </div>
        ) : (
          <div className="mx-6 mb-6 overflow-x-auto rounded-xl border border-border">
            <table className="border-collapse text-[11px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  {/* Staff header — sticky */}
                  <th className="sticky left-0 z-10 w-44 min-w-[176px] bg-muted/80 px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap">
                    Staff
                  </th>
                  {/* Day headers */}
                  {days.map(({ day, dow, weekStart, isWeekend, isToday }) => (
                    <th
                      key={day}
                      className={[
                        "min-w-[36px] px-0 py-1.5 text-center font-medium",
                        weekStart ? "border-l border-l-border" : "",
                        isWeekend ? "bg-muted/30" : "",
                        isToday
                          ? "border-l-2 border-l-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                          : "text-muted-foreground",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="text-[9px] uppercase leading-none">{dow}</div>
                      <div
                        className={["text-xs font-semibold", isToday ? "text-primary" : ""].join(" ")}
                      >
                        {day}
                      </div>
                    </th>
                  ))}
                  {/* Summary header */}
                  <th className="border-l px-3 py-2.5 text-center text-xs font-medium whitespace-nowrap">
                    D / N / S
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStaffIds.length === 0 ? (
                  <tr>
                    <td
                      colSpan={daysInMonth + 2}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No staff match &ldquo;{staffFilter}&rdquo;
                    </td>
                  </tr>
                ) : (
                  filteredStaffIds.map((staffId) => {
                    const isMyRow = staffId === myStaffId;
                    const sum = summarise(staffId);
                    const displayName = staffNames[staffId] ?? staffId;
                    return (
                      <tr
                        key={staffId}
                        className={`border-b last:border-0 hover:bg-muted/30 ${isMyRow && !myShiftsMode ? "shadow-[inset_3px_0_0_0_hsl(var(--primary))] bg-blue-50/30 dark:bg-blue-950/10" : ""}`}
                      >
                        {/* Staff name — sticky, truncated with title for full name */}
                        <td
                          className="sticky left-0 z-10 w-44 min-w-[176px] max-w-[176px] truncate bg-background px-3 py-1 font-medium whitespace-nowrap"
                          title={displayName}
                        >
                          {displayName}
                        </td>
                        {/* Shift cells */}
                        {days.map(({ day, weekStart, isWeekend, isToday }) => {
                          const entry = shiftMap[staffId]?.[day];
                          return (
                            <td
                              key={day}
                              className={[
                                "p-0.5",
                                weekStart ? "border-l border-l-border" : "",
                                isWeekend ? "bg-muted/20" : "",
                                isToday
                                  ? "border-l-2 border-l-blue-400/60 bg-blue-50/40 dark:bg-blue-950/10"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <ShiftChip
                                shift={entry?.type}
                                notes={entry?.notes}
                                pending={mutation.isPending}
                                onSelect={(type) => handleCellSelect(staffId, day, type)}
                                onClear={() => handleClearCell(staffId, day)}
                              />
                            </td>
                          );
                        })}
                        {/* Summary */}
                        <td className="border-l px-3 py-1">
                          <div className="flex items-center gap-1 font-mono text-[10px] tabular-nums">
                            <span className="font-semibold text-blue-700 dark:text-blue-300">
                              {sum.D}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="font-semibold text-purple-700 dark:text-purple-300">
                              {sum.N}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                              {sum.S}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Main>

      {/* ── Custom shift note dialog ─────────────────────────────────────────── */}
      <Dialog
        open={customDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCustomCancel();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingCustom?.shiftType === "Outreach" ? "Outreach Details" : "Custom Shift Note"}
            </DialogTitle>
            <DialogDescription>
              {pendingCustom?.shiftType === "Outreach"
                ? "Describe the outreach activity or location."
                : "Describe this custom shift arrangement (e.g. standby from home, covering for absence)."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="custom-note">
                {pendingCustom?.shiftType === "Outreach" ? "Outreach description" : "Note / Description"}
              </Label>
              <Textarea
                id="custom-note"
                placeholder={
                  pendingCustom?.shiftType === "Outreach"
                    ? "e.g. Field visit to Ministry of Finance…"
                    : "e.g. Standby from home, covering for absence…"
                }
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={3}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This note appears on the shift chip in the grid. Leave blank to show only the shift type.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCustomCancel}>
              Cancel
            </Button>
            <Button onClick={handleCustomConfirm} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Swap request dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={swapDialogOpen}
        onOpenChange={(open) => {
          if (!open) setSwapDialogOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Shift Swap</DialogTitle>
            <DialogDescription>
              Select the dates and staff member to swap shifts with. The grid will be updated to
              reflect the swapped assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="swap-from">Your Shift Date</Label>
              <Input
                id="swap-from"
                type="date"
                value={swapFromDate}
                onChange={(e) => setSwapFromDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="swap-staff">Swap With</Label>
              <Select value={swapWithStaffId} onValueChange={(v) => setSwapWithStaffId(v ?? "")}>
                <SelectTrigger id="swap-staff">
                  <SelectValue placeholder="Select staff member…" />
                </SelectTrigger>
                <SelectContent>
                  {allStaffIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {staffNames[id] ?? id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="swap-to">Their Shift Date</Label>
              <Input
                id="swap-to"
                type="date"
                value={swapToDate}
                onChange={(e) => setSwapToDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="swap-reason">Reason (optional)</Label>
              <Textarea
                id="swap-reason"
                placeholder="Brief reason for the swap request…"
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSwapSubmit}
              disabled={mutation.isPending || !swapFromDate || !swapWithStaffId || !swapToDate}
            >
              Submit Swap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
