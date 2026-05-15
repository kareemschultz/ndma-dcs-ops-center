/**
 * PDF export utilities for DCS Ops Center.
 * Uses jsPDF + jspdf-autotable for all PDF generation.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Date formatter ────────────────────────────────────────────────────────────
function fmtDate(val: Date | string | null | undefined): string {
  if (!val) return "—";
  try {
    const d = val instanceof Date ? val : new Date(val);
    return d.toLocaleDateString("en-GY");
  } catch {
    return String(val);
  }
}

// ─── Brand colours ─────────────────────────────────────────────────────────────
const BRAND_BLUE = [26, 86, 219] as const; // oklch(0.52 0.158 240) ≈ #1a56db
const BRAND_DARK = [17, 24, 39] as const; // gray-900
const BRAND_MID = [75, 85, 99] as const; // gray-600
const BRAND_LIGHT = [249, 250, 251] as const; // gray-50

function addHeader(doc: jsPDF, title: string, subtitle?: string) {
  // Logo / org name strip
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, 210, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("NATIONAL DATA MANAGEMENT AUTHORITY · DATA CENTRE SERVICES", 10, 7);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("DCS Ops Center", 10, 14);

  // Page title
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 10, 30);

  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND_MID);
    doc.text(subtitle, 10, 37);
    return 44; // next Y position
  }
  return 37;
}

function addFooter(doc: jsPDF) {
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_MID);
    doc.text(
      `Generated ${new Date().toLocaleString("en-GY", { timeZone: "America/Guyana" })} · Page ${i} of ${pageCount}`,
      10,
      290,
    );
    doc.text("NDMA DCS Ops Center — Confidential", 105, 290, { align: "center" });
  }
}

// ─── Appraisal report ───────────────────────────────────────────────────────────

type AppraisalDetail = {
  id: string;
  status: string;
  typeOfReview?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  scheduledDate?: Date | string | null;
  completedDate?: Date | string | null;
  location?: string | null;
  totalScore?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  incrementPct?: number | null;
  submittedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  rejectionReason?: string | null;
  staffFeedback?: string | null;
  supervisorComments?: string | null;
  staffProfile?: {
    user?: { name?: string | null; email?: string | null } | null;
    department?: { name?: string | null } | null;
  } | null;
  reviewer?: { user?: { name?: string | null } | null } | null;
  cycle?: { year?: number | null; half?: string | null } | null;
  ratings?: Array<{ category: string; score: number; comment?: string | null }>;
  achievements?: Array<{ text: string; seq?: number }>;
  goals?: Array<{ text: string; seq?: number }>;
  responsibilities?: Array<{ text: string; seq?: number }>;
  signatures?: Array<{
    role?: string | null;
    signedAt?: Date | string | null;
    signer?: { user?: { name?: string | null } | null } | null;
  }>;
};

const RATING_LABELS: Record<string, string> = {
  organisational_skills: "Organisational Skills",
  quality_of_work: "Quality of Work",
  dependability: "Dependability",
  communication_skills: "Communication Skills",
  cooperation: "Cooperation",
  initiative: "Initiative",
  technical_skills: "Technical Skills",
  attendance_punctuality: "Attendance & Punctuality",
};

function scoreLabel(score: number) {
  if (score >= 5) return "Outstanding";
  if (score >= 4) return "Exceeds Expectations";
  if (score >= 3) return "Meets Expectations";
  if (score >= 2) return "Needs Improvement";
  return "Unsatisfactory";
}

export function exportAppraisalPDF(appraisal: AppraisalDetail) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const staffName = appraisal.staffProfile?.user?.name ?? "Unknown Staff";
  const period = appraisal.cycle
    ? `${appraisal.cycle.year ?? ""} ${appraisal.cycle.half?.toUpperCase() ?? ""}`.trim()
    : [fmtDate(appraisal.periodStart), fmtDate(appraisal.periodEnd)].filter((d) => d !== "—").join(" – ");

  let y = addHeader(
    doc,
    "Staff Appraisal Report",
    `${staffName} · ${period}`,
  );

  // ── Section: Staff info ──────────────────────────────────────────────────────
  y += 4;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_BLUE);
  doc.text("1. APPRAISAL INFORMATION", 10, y);
  y += 5;

  const infoRows = [
    ["Staff Member", staffName],
    ["Department", appraisal.staffProfile?.department?.name ?? "—"],
    ["Reviewer", appraisal.reviewer?.user?.name ?? "—"],
    ["Review Period", period || "—"],
    ["Type of Review", appraisal.typeOfReview ?? "—"],
    ["Location", appraisal.location ?? "—"],
    ["Status", appraisal.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())],
    ["Scheduled Date", fmtDate(appraisal.scheduledDate)],
    ["Completed Date", fmtDate(appraisal.completedDate ?? appraisal.approvedAt)],
  ];

  autoTable(doc, {
    startY: y,
    head: [],
    body: infoRows,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: BRAND_MID as [number, number, number], cellWidth: 48 },
      1: { textColor: BRAND_DARK as [number, number, number] },
    },
    margin: { left: 10, right: 10 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Section: Score summary ───────────────────────────────────────────────────
  if (appraisal.percentage != null) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_BLUE);
    doc.text("2. SCORE SUMMARY", 10, y);
    y += 5;

    const pct = appraisal.percentage;
    const grade = pct >= 80 ? "Excellent" : pct >= 60 ? "Satisfactory" : "Needs Improvement";

    autoTable(doc, {
      startY: y,
      head: [["Total Score", "Max Score", "Percentage", "Grade", "Increment %"]],
      body: [[
        String(appraisal.totalScore ?? "—"),
        String(appraisal.maxScore ?? "—"),
        `${pct}%`,
        grade,
        appraisal.incrementPct != null ? `${appraisal.incrementPct}%` : "—",
      ]],
      theme: "grid",
      headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 9, fontStyle: "bold" },
      styles: { fontSize: 9, halign: "center" },
      margin: { left: 10, right: 10 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Section: Ratings matrix ──────────────────────────────────────────────────
  if (appraisal.ratings && appraisal.ratings.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_BLUE);
    doc.text("3. RATINGS MATRIX", 10, y);
    y += 5;

    const ratingsBody = appraisal.ratings.map((r) => [
      RATING_LABELS[r.category] ?? r.category,
      String(r.score),
      scoreLabel(r.score),
      r.comment ?? "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Category", "Score (1–5)", "Performance Level", "Comment"]],
      body: ratingsBody,
      theme: "striped",
      headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 9, fontStyle: "bold" },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { halign: "center", cellWidth: 22 },
        2: { cellWidth: 42 },
      },
      margin: { left: 10, right: 10 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Section: Achievements ────────────────────────────────────────────────────
  if (appraisal.achievements && appraisal.achievements.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_BLUE);
    doc.text("4. KEY ACHIEVEMENTS", 10, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["#", "Achievement"]],
      body: appraisal.achievements.map((a, i) => [String(i + 1), a.text]),
      theme: "striped",
      headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 9, fontStyle: "bold" },
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 12, halign: "center" } },
      margin: { left: 10, right: 10 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Section: Goals ───────────────────────────────────────────────────────────
  if (appraisal.goals && appraisal.goals.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_BLUE);
    doc.text("5. GOALS FOR NEXT PERIOD", 10, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["#", "Goal"]],
      body: appraisal.goals.map((g, i) => [String(i + 1), g.text]),
      theme: "striped",
      headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 9, fontStyle: "bold" },
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 12, halign: "center" } },
      margin: { left: 10, right: 10 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Section: Feedback & Comments ─────────────────────────────────────────────
  if (appraisal.staffFeedback || appraisal.supervisorComments) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_BLUE);
    doc.text("6. FEEDBACK & COMMENTS", 10, y);
    y += 5;

    const feedbackRows: [string, string][] = [];
    if (appraisal.staffFeedback) {
      feedbackRows.push(["Staff Self-Assessment", appraisal.staffFeedback]);
    }
    if (appraisal.supervisorComments) {
      feedbackRows.push(["Supervisor Comments", appraisal.supervisorComments]);
    }

    autoTable(doc, {
      startY: y,
      head: [],
      body: feedbackRows,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: "bold", textColor: BRAND_MID as [number, number, number], cellWidth: 48 },
        1: { textColor: BRAND_DARK as [number, number, number] },
      },
      margin: { left: 10, right: 10 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Section: Rejection reason ────────────────────────────────────────────────
  if (appraisal.rejectionReason) {
    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFillColor(254, 242, 242); // red-50
    doc.roundedRect(10, y, 190, 18, 2, 2, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(185, 28, 28); // red-700
    doc.text("Rejection Reason:", 14, y + 6);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(appraisal.rejectionReason, 160);
    doc.text(wrapped, 14, y + 12);
    y += 8 + wrapped.length * 5;
  }

  // ── Section: Signatures ──────────────────────────────────────────────────────
  if (appraisal.signatures && appraisal.signatures.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_BLUE);
    doc.text("7. SIGNATURES", 10, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Role", "Signatory", "Date"]],
      body: appraisal.signatures.map((s) => [
        s.role ?? "—",
        s.signer?.user?.name ?? "—",
        s.signedAt ? fmtDate(s.signedAt) : "Pending",
      ]),
      theme: "grid",
      headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 9, fontStyle: "bold" },
      styles: { fontSize: 9 },
      margin: { left: 10, right: 10 },
    });
  }

  addFooter(doc);

  const filename = `Appraisal_${staffName.replace(/\s+/g, "_")}_${period.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}

// ─── Official NDMA Performance Evaluation report ─────────────────────────────────

const OFFICIAL_CATEGORIES_PDF: { key: string; label: string }[] = [
  { key: "organisational_skills", label: "Organisational Skills" },
  { key: "quality_of_work", label: "Quality of Work" },
  { key: "dependability", label: "Dependability" },
  { key: "communication_skills", label: "Communication Skills" },
  { key: "cooperation", label: "Cooperation" },
  { key: "initiative", label: "Initiative" },
  { key: "technical_skills", label: "Problem Solving" },
  { key: "attendance_punctuality", label: "Overall Professionalism" },
];

const RATING_WORD_PDF: Record<number, string> = {
  5: "Excellent",
  4: "Good",
  3: "Acceptable",
  2: "Needs Improvement",
  1: "Unsatisfactory",
};

export type OfficialAppraisalPdf = {
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

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  let yy = y;
  if (yy > 262) {
    doc.addPage();
    yy = 20;
  }
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_BLUE);
  doc.text(text, 10, yy);
  return yy + 5;
}

function afterTable(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
}

export function exportOfficialAppraisalPDF(
  data: OfficialAppraisalPdf,
  filename = "Performance_Evaluation.pdf",
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const period = [data.periodStart, data.periodEnd]
    .filter(Boolean)
    .join(" to ");
  let y = addHeader(
    doc,
    "Performance Evaluation Form",
    `${data.employeeName} · ${period}`,
  );
  y += 3;

  // 1. Employee information
  y = sectionTitle(doc, "EMPLOYEE INFORMATION", y);
  autoTable(doc, {
    startY: y,
    body: [
      ["Employee Name", data.employeeName, "Job Title", data.jobTitle],
      ["Supervisor", data.supervisor, "Department", data.department],
      ["Location", data.location, "Type of Review", data.typeOfReview || "Biannually"],
      ["Period From", data.periodStart, "Period To", data.periodEnd],
      ["Status", data.status, "", ""],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: BRAND_MID as [number, number, number], cellWidth: 32 },
      2: { fontStyle: "bold", textColor: BRAND_MID as [number, number, number], cellWidth: 32 },
    },
    margin: { left: 10, right: 10 },
  });
  y = afterTable(doc);

  // 2. Rating categories
  let categoryTotal = 0;
  const categoryBody = OFFICIAL_CATEGORIES_PDF.map((cat, i) => {
    const r = data.ratingMatrix[cat.key] ?? 0;
    categoryTotal += r;
    return [
      String(i + 1),
      cat.label,
      r ? String(r) : "—",
      r ? RATING_WORD_PDF[r] ?? "" : "—",
      data.categoryComments[cat.key] ?? "",
    ];
  });
  y = sectionTitle(doc, "PERFORMANCE RATING CATEGORIES", y);
  autoTable(doc, {
    startY: y,
    head: [["#", "Category", "Rating", "Level", "Comments"]],
    body: categoryBody,
    foot: [["", "General Performance Subtotal", String(categoryTotal), "/ 40", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 8.5, fontStyle: "bold" },
    footStyles: { fillColor: BRAND_LIGHT as [number, number, number], textColor: BRAND_DARK as [number, number, number], fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 30 },
    },
    margin: { left: 10, right: 10 },
  });
  y = afterTable(doc);

  // 3. Core responsibilities
  let respTotal = 0;
  const respBody = Array.from({ length: 5 }, (_, i) => {
    const r = data.responsibilities[i];
    const rating = r?.rating ?? 0;
    respTotal += rating;
    return [
      String(i + 1),
      r?.title ?? "—",
      rating ? String(rating) : "—",
      rating ? RATING_WORD_PDF[rating] ?? "" : "—",
    ];
  });
  y = sectionTitle(doc, "CORE RESPONSIBILITIES", y);
  autoTable(doc, {
    startY: y,
    head: [["#", "Responsibility", "Rating", "Level"]],
    body: respBody,
    foot: [["", "Core Responsibilities Subtotal", String(respTotal), "/ 25"]],
    theme: "striped",
    headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 8.5, fontStyle: "bold" },
    footStyles: { fillColor: BRAND_LIGHT as [number, number, number], textColor: BRAND_DARK as [number, number, number], fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 34 },
    },
    margin: { left: 10, right: 10 },
  });
  y = afterTable(doc);
  if (data.responsibilitiesComment) {
    autoTable(doc, {
      startY: y,
      body: [["Comments", data.responsibilitiesComment]],
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: { 0: { fontStyle: "bold", textColor: BRAND_MID as [number, number, number], cellWidth: 30 } },
      margin: { left: 10, right: 10 },
    });
    y = afterTable(doc);
  }

  // 4. Score summary
  const rawTotal = categoryTotal + respTotal;
  const pct = Math.round((rawTotal / 65) * 100);
  const increment = pct <= 60 ? 1 : pct <= 70 ? 2 : pct <= 80 ? 3 : pct <= 90 ? 4 : 5;
  y = sectionTitle(doc, "SCORE SUMMARY", y);
  autoTable(doc, {
    startY: y,
    head: [["Total Score", "Max Score", "Percentage", "Salary Increment"]],
    body: [[String(rawTotal), "65", `${pct}%`, `${increment}%`]],
    theme: "grid",
    headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 9, fontStyle: "bold" },
    styles: { fontSize: 10, halign: "center", fontStyle: "bold" },
    margin: { left: 10, right: 10 },
  });
  y = afterTable(doc);

  // 5. Development summary
  y = sectionTitle(doc, "SUMMARY & DEVELOPMENT", y);
  autoTable(doc, {
    startY: y,
    body: [
      ["Areas of Strength", data.areasOfStrength || "—"],
      ["Improvements Made Over the Past Year", data.improvementsMade || "—"],
      ["Areas for Development", data.areasForDevelopment || "—"],
      ["Actions Planned to Address Development", data.developmentActions || "—"],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: BRAND_MID as [number, number, number], cellWidth: 60 },
    },
    margin: { left: 10, right: 10 },
  });
  y = afterTable(doc);

  // 6. Achievements
  const achRows = data.achievements.filter((a) => a.trim());
  if (achRows.length > 0) {
    y = sectionTitle(doc, "KEY ACHIEVEMENTS", y);
    autoTable(doc, {
      startY: y,
      head: [["#", "Achievement"]],
      body: achRows.map((a, i) => [String(i + 1), a]),
      theme: "striped",
      headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 8.5, fontStyle: "bold" },
      styles: { fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 10, halign: "center" } },
      margin: { left: 10, right: 10 },
    });
    y = afterTable(doc);
  }

  // 7. Goals + indicators
  const goalRows = data.goals.filter((g) => g.goal.trim());
  if (goalRows.length > 0) {
    y = sectionTitle(doc, "GOALS FOR NEXT PERIOD", y);
    autoTable(doc, {
      startY: y,
      head: [["#", "Goal to be Accomplished", "Performance Indicator"]],
      body: goalRows.map((g, i) => [String(i + 1), g.goal, g.indicator || "—"]),
      theme: "striped",
      headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 8.5, fontStyle: "bold" },
      styles: { fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 10, halign: "center" } },
      margin: { left: 10, right: 10 },
    });
    y = afterTable(doc);
  }

  // 8. Signatures
  y = sectionTitle(doc, "SIGNATURES", y);
  autoTable(doc, {
    startY: y,
    head: [["Role", "Signature", "Date"]],
    body: [
      ["Employee", "", ""],
      ["Manager / Director", "", ""],
      ["Human Resources Manager", "", ""],
      ["Deputy General Manager, Administration", "", ""],
      ["General Manager", "", ""],
    ],
    theme: "grid",
    headStyles: { fillColor: BRAND_BLUE as [number, number, number], fontSize: 8.5, fontStyle: "bold" },
    styles: { fontSize: 9, minCellHeight: 10 },
    columnStyles: { 1: { cellWidth: 70 }, 2: { cellWidth: 40 } },
    margin: { left: 10, right: 10 },
  });

  addFooter(doc);
  doc.save(filename);
}

// ─── Generic list report ────────────────────────────────────────────────────────

export function exportListPDF(
  title: string,
  subtitle: string,
  columns: string[],
  rows: (string | number | null | undefined)[][],
  filename: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addHeader(doc, title, subtitle);

  autoTable(doc, {
    startY: 44,
    head: [columns],
    body: rows.map((row) => row.map((cell) => cell ?? "—")),
    theme: "striped",
    headStyles: {
      fillColor: BRAND_BLUE as [number, number, number],
      fontSize: 8,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: BRAND_LIGHT as [number, number, number] },
    styles: { fontSize: 8, cellPadding: 2 },
    margin: { left: 10, right: 10 },
  });

  addFooter(doc);
  doc.save(filename);
}
