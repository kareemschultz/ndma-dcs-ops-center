/**
 * generate-import-templates.ts — Generate .example.csv variants + 12 additional templates
 *
 * For each existing template in apps/web/public/import-templates/*.csv, generates an
 * accompanying .example.csv with 2-3 realistic sample rows. Also creates 12 additional
 * templates that round out the master plan §13 commitment (30+ templates).
 *
 * Usage: bun scripts/generate-import-templates.ts
 *
 * Idempotent — re-running overwrites existing files with the canonical content.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const TEMPLATES_DIR = path.join(process.cwd(), "apps/web/public/import-templates");

/**
 * For each existing template, the example rows. Headers are read from the existing .csv file.
 */
const EXAMPLE_ROWS: Record<string, string[]> = {
  "staff.csv": [
    "Alice Mensah,alice.mensah@ndma.gov.gh,Infrastructure,full_time,592-200-0001,Staff,sachin.rampersaud@ndma.gov.gh,Grace Mensah,592-200-1001,Systems Engineer,EMP-0101",
    "Bob Asante,bob.asante@ndma.gov.gh,Network Operations,full_time,592-200-0002,Team_Lead,ataybia.mclean@ndma.gov.gh,Peter Asante,592-200-1002,Senior Network Engineer,EMP-0102",
    "Carol Persaud,carol.persaud@ndma.gov.gh,Data Centre Services,contract,592-200-0003,Staff,sachin.rampersaud@ndma.gov.gh,David Persaud,592-200-1003,NOC Technician,EMP-0103",
  ],
  "appraisals.csv": [
    "alice.mensah@ndma.gov.gh,sachin.rampersaud@ndma.gov.gh,2026,h1,2026-01-01,2026-06-30,full,completed,82,2026-07-01,2026-07-15,Quality of Work,Delivers tickets on time,4,Strong attention to detail,note,Excellent quarter overall",
    "bob.asante@ndma.gov.gh,sachin.rampersaud@ndma.gov.gh,2025,h2,2025-07-01,2025-12-31,full,completed,76,2026-01-15,2026-01-30,Communication,Clear status updates,3,Could share blockers earlier,note,Improving steadily",
  ],
  "attendance.csv": [
    "alice.mensah@ndma.gov.gh,2026-03-12,present,8,Regular workday",
    "bob.asante@ndma.gov.gh,2026-03-12,absent,0,Reported sick",
  ],
  "calendar_events.csv": [
    "Kareem Schultz Birthday,birthday,2026-08-15,kareem.schultz@ndma.gov.gh,Annual reminder",
    "Republic Day,public_holiday,2026-02-23,,National holiday",
    "Q1 Server Room Cleaning,routine_maintenance,2026-03-30,,Quarterly task",
  ],
  "callouts.csv": [
    "alice.mensah@ndma.gov.gh,2025-04-20,Modem offline at DCS-North,3,Restored via remote IPAM reset",
    "bob.asante@ndma.gov.gh,2025-04-22,Power outage at Liliendaal,4,Generator switchover; logged in TOSD",
  ],
  "contracts.csv": [
    "alice.mensah@ndma.gov.gh,full_time,2024-01-01,2026-12-31,renewing,h2_2026,/files/contracts/alice_2024.pdf,Renewal pending appraisal 2",
    "carol.persaud@ndma.gov.gh,contract,2026-01-01,2026-12-31,active,h1_2026,/files/contracts/carol_2026.pdf,",
  ],
  "exam_schedule.csv": [
    "alice.mensah@ndma.gov.gh,CCNA 200-301,2026-09-15,scheduled",
    "bob.asante@ndma.gov.gh,JNCIS-ENT,2026-07-30,passed",
  ],
  "forms.csv": [
    "Leave Request Form,Standard leave request,HR & Leave,/forms/leave-request-v2.pdf,2026-01-15",
    "PPE Issuance Acknowledgement,Sign on receipt of PPE,Operations,/forms/ppe-ack.pdf,2025-11-20",
  ],
  "leave.csv": [
    "alice.mensah@ndma.gov.gh,annual,2026-08-10,2026-08-21,12,Family vacation",
    "bob.asante@ndma.gov.gh,medical,2026-04-05,2026-04-07,3,Medical certificate attached",
  ],
  "onboarding.csv": [
    "newhire@ndma.gov.gh,Issue laptop + monitor,it_equipment,true,2026-03-01,2026-03-05,",
    "newhire@ndma.gov.gh,Building access card,building_access,false,,2026-03-10,",
  ],
  "operations_work_update.csv": [
    'work_item,Week 12,2026,week_0317,DCS Patch Window,Apply 2026.03 firmware updates,2026-03-17,12 routers + 8 switches,in_progress,2026-03-22,2026-03-22,0,alice.mensah@ndma.gov.gh,manual,high,2026-03-17,2026-03-22,DCS-Core,8,2026-03-25,Patch all enterprise routers',
    "routine,Routine,2026,routine,Q1 Server Room Cleaning,Vacuum + dust filter check,2026-03-30,Castellani server room,scheduled,2026-04-15,2026-03-30,0,bob.asante@ndma.gov.gh,manual,medium,2026-03-30,2026-03-30,DCS-Ops,2,,",
  ],
  "platform_accounts.csv": [
    "alice.mensah@ndma.gov.gh,IPAM,alice.mensah,local,true,admin,Full IPAM admin",
    "bob.asante@ndma.gov.gh,Zabbix,basante,sso,true,operator,Read-only after promotion to lead",
  ],
  "policy.csv": [
    "Acceptable Use Policy,All staff must comply with the AUP when accessing NDMA systems,/policies/aup-v3.pdf,2025-09-01",
    "Remote Access Policy,VPN access via MiFi requires 2FA,/policies/remote-access.pdf,2026-01-10",
  ],
  "ppe.csv": [
    "alice.mensah@ndma.gov.gh,safety_boots,2024-08-15,issued,SB-2024-101,Size 9,Issued during Q3 2024 PPE drive",
    "bob.asante@ndma.gov.gh,laptop,2024-06-01,issued,LP-NDMA-0042,,Assigned with MiFi-0042",
  ],
  "promotions.csv": [
    "alice.mensah@ndma.gov.gh,2026-01-01,2025-12-15,Systems Engineer,Senior Systems Engineer,/letters/alice_promo_2026.pdf,Following appraisal 2",
    "bob.asante@ndma.gov.gh,2025-07-01,2025-06-20,Network Technician,Network Engineer II,/letters/bob_promo_2025.pdf,",
  ],
  "roster.csv": [
    "dcs_oncall,sachin.rampersaud@ndma.gov.gh,EMP-0001,DCS,2026,week_0317,2026-03-17,lead,,,Lead engineer week 12",
    "noc_shift,wynonna.watson@ndma.gov.gh,EMP-NOC-007,NOC,2026,m_03,2026-03-12,12hr Day,07:00,19:00,Standard day shift",
  ],
  "training.csv": [
    "alice.mensah@ndma.gov.gh,CCNA 200-301 Bootcamp,Cisco NetAcad,certification,in_progress,2026-01-15,,2026-09-15,2029-09-15,handout,Cert prep deck,/training/ccna-prep.pdf,Sponsored by NDMA,2026,h1",
    "bob.asante@ndma.gov.gh,Junos Essentials,Juniper,course,completed,2025-04-10,2025-04-30,2025-04-30,2028-04-30,video,Course recording,/training/junos-ess.mp4,,2025,h1",
  ],
  "work.csv": [
    "work_item,DCS Core Upgrade,Replace EOL switches,Phase 1 inventory,Inventory all switches at DCS-Core,in_progress,high,alice.mensah@ndma.gov.gh,DCS,2026-04-30,week_0317,12,,,2026-05-30,2026-04-30,Inventory complete by week 14,2026",
    "routine,Server Room Cleaning,Q2 cleaning,,Q2 quarterly server room cleaning,scheduled,medium,bob.asante@ndma.gov.gh,DCS,2026-06-30,routine,2,,,,2026-06-30,,2026",
  ],
};

/**
 * 12 additional templates (master plan §13 commitment of 30+ total)
 */
const ADDITIONAL_TEMPLATES: Record<string, { headers: string; examples: string[]; description: string }> = {
  "access_services.csv": {
    description: "Master access matrix — staff × 13 services with role + access level columns. Source: AccountManagementMarch_*.xlsx",
    headers:
      "staff_email,ipam_access,ipam_role,zabbix_access,zabbix_role,esight_access,esight_role,ivsneteco_access,ivsneteco_role,nce_fan_access,nce_fan_role,neteco_access,neteco_role,lte_grafana_access,lte_grafana_role,generator_grafana_access,generator_grafana_role,plum_access,plum_role,kibana_access,kibana_role,radius_access,radius_role,forticlient_access,forticlient_role,mifi_vpn_access",
    examples: [
      "alice.mensah@ndma.gov.gh,true,admin,true,operator,false,,true,viewer,false,,true,operator,true,viewer,false,,true,operator,true,viewer,true,operator,true,enabled,true",
      "bob.asante@ndma.gov.gh,true,operator,true,operator,true,operator,true,operator,true,viewer,true,operator,true,viewer,false,,true,operator,false,,true,viewer,true,enabled,true",
    ],
  },
  "lateness.csv": {
    description: "Monthly lateness aggregates per staff per (year, month). Source: LatenessReportNOC&DC_*.xlsx",
    headers:
      "staffEmail,year,month,totalTimeLateMinutes,daysLate,daysMissingFromAttendance,daysOnSchedule,notes",
    examples: [
      "alice.mensah@ndma.gov.gh,2026,1,42,3,0,18,",
      "bob.asante@ndma.gov.gh,2026,2,15,2,0,20,Travel days excluded",
    ],
  },
  "tosd.csv": {
    description: "Time Off / Sick Days register — replaces deleted Callouts + Attendance Exceptions. 7 types.",
    headers: "staffEmail,date,type,reason,hours,notes",
    examples: [
      "alice.mensah@ndma.gov.gh,2026-04-15,reported_sick,Flu,8,Medical cert pending",
      "bob.asante@ndma.gov.gh,2026-05-02,work_from_home,Internet maintenance at office,8,",
      "carol.persaud@ndma.gov.gh,2026-03-22,callout_legacy,Power outage callout 2023,4,Historical migrated row",
    ],
  },
  "commendations.csv": {
    description: "Positive recognition per (staff, year, month). Source: StaffCommendationJournal_*.xlsx",
    headers: "staffEmail,year,month,commendation,recordedBy",
    examples: [
      "wynonna.watson@ndma.gov.gh,2026,3,Pulled double shift covering for sick colleague,sachin.rampersaud@ndma.gov.gh",
      "asif.khan@ndma.gov.gh,2026,2,Diagnosed modem-offline correlation with iMonitor,sachin.rampersaud@ndma.gov.gh",
    ],
  },
  "noc_performance.csv": {
    description: "Monthly NOC performance metrics per (staff, year, month). Source: EmployeeOfTheMonth_*.xlsx",
    headers:
      "staffEmail,year,month,mt,ittIncident,ittProblem,dShift,sShift,nShift,nccClosed,nctTotal,ma,percentageMistakes,percentageContribution",
    examples: [
      "joshua.deygoo@ndma.gov.gh,2026,2,2,52,4,18,0,4,48,52,1,3.8,17.2",
      "wynonna.watson@ndma.gov.gh,2026,2,1,33,2,15,0,7,32,34,0,2.9,11.0",
    ],
  },
  "noc_performance_journal.csv": {
    description: "NOC mistake-matrix tracker per (staff, year, month, category). Source: StaffPerformanceJournal_*.xlsx",
    headers: "staffEmail,year,month,category,count,narrative",
    examples: [
      "asif.khan@ndma.gov.gh,2026,3,tickets_itop,1,Missed escalation on TKT-2026-0421",
      "stefan.hopkinson@ndma.gov.gh,2026,3,alarms,2,Acked but did not respond to 2 critical alarms",
    ],
  },
  "service_access_registry.csv": {
    description: "Per-staff per-platform Layer-3 registry with provenance. Source: AccountManagement (rebuilt by sync adapters).",
    headers:
      "staffEmail,platformName,accountUsername,accountType,accountActive,privilegeLevel,groups,usernameSource,accountTypeSource,privilegeSource,groupsSource,notes",
    examples: [
      "alice.mensah@ndma.gov.gh,Fortigate,alice.mensah,sso,true,admin,FortiClient-VPN-Admins,sync_adapter,sync_adapter,manual,manual,",
      "bob.asante@ndma.gov.gh,Plum,basante,local,true,operator,plum-operators,manual,manual,manual,manual,",
    ],
  },
  "external_contacts.csv": {
    description: "Vendor + ISP + partner contacts (not staff). Source: manual entry / vendor cards.",
    headers: "company,fullName,role,email,phone,vpnAccess,notes",
    examples: [
      "Huawei GY,Liang Wei,Account Manager,liang.wei@huawei.com,+592-555-0100,false,Primary contact for OptiX support",
      "GTT,Mark Allicock,Field Engineer,mark.allicock@gtt.gy,+592-555-0200,true,On-site for fibre maintenance",
    ],
  },
  "access_groups.csv": {
    description: "Logical groupings of platform accounts (admin/operator/viewer).",
    headers: "groupName,platformName,description,memberStaffEmails",
    examples: [
      "Fortigate-VPN-Admins,Fortigate,Full VPN configuration access,alice.mensah@ndma.gov.gh;sachin.rampersaud@ndma.gov.gh",
      "Zabbix-Operators,Zabbix,Standard NOC monitoring,wynonna.watson@ndma.gov.gh;asif.khan@ndma.gov.gh",
    ],
  },
  "temporary_changes.csv": {
    description: "Temporary infrastructure changes register. Owner can be staff_email or external_contact_name.",
    headers:
      "title,category,risk,publicIp,siteCode,ownerStaffEmail,ownerExternalName,scheduledStart,scheduledEnd,actualRemovedAt,reason,notes",
    examples: [
      "Temp VPN allowlist for vendor,vpn,low,203.0.113.10,LIL,,Liang Wei,2026-03-01,2026-03-15,2026-03-14,Vendor remote support for OptiX upgrade,Removed early",
      "Static route to GTT failover,routing,medium,,CSL,alice.mensah@ndma.gov.gh,,2026-04-10,2026-04-30,,Primary link maintenance window,Active",
    ],
  },
  "procurement.csv": {
    description: "Purchase requisitions + line items + approval chain.",
    headers:
      "prTitle,requesterEmail,priority,department,justification,itemDescription,itemQty,itemUnitCost,itemCurrency,vendor,status",
    examples: [
      "Replacement Cisco 3850 stack,alice.mensah@ndma.gov.gh,high,DCS,EOL replacement for DCS-Core stack,Cisco WS-C3850-48T-S,2,5800.00,USD,Massy Technologies,submitted",
      "Server room thermal sensors,bob.asante@ndma.gov.gh,medium,DCS,Q2 environmental upgrade,Sensaphone TMP-500,5,180.00,USD,Sensaphone Direct,approved",
    ],
  },
  "incidents.csv": {
    description: "Incident management — distinct from TOSD/callouts. Linked to services + responders.",
    headers:
      "title,severity,status,reportedAt,resolvedAt,affectedServices,createdByEmail,leadResponderEmail,rootCauseSummary,notes",
    examples: [
      "Liliendaal core router crash,sev1,resolved,2026-04-05T03:42:00Z,2026-04-05T05:15:00Z,DCS-Core;Enterprise-VPN,alice.mensah@ndma.gov.gh,sachin.rampersaud@ndma.gov.gh,Memory exhaustion from BGP route churn,PIR ticket #INC-2026-0091",
      "Plum monitoring outage,sev3,investigating,2026-05-10T14:00:00Z,,Plum-Monitoring,wynonna.watson@ndma.gov.gh,bob.asante@ndma.gov.gh,,Suspect DNS issue at Plum side",
    ],
  },
};

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    console.error(`Templates dir not found: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  let written = 0;

  // 1. Generate .example.csv variants for existing templates
  for (const [filename, examples] of Object.entries(EXAMPLE_ROWS)) {
    const src = path.join(TEMPLATES_DIR, filename);
    if (!fs.existsSync(src)) {
      console.warn(`⚠️ Source template missing: ${filename} — skipping example variant`);
      continue;
    }
    const headers = fs.readFileSync(src, "utf-8").split("\n")[0]!;
    const out = path.join(TEMPLATES_DIR, filename.replace(".csv", ".example.csv"));
    fs.writeFileSync(out, [headers, ...examples].join("\n") + "\n");
    written++;
    console.log(`✅ ${path.basename(out)}`);
  }

  // 2. Generate 12 additional templates (.csv + .example.csv)
  for (const [filename, def] of Object.entries(ADDITIONAL_TEMPLATES)) {
    const base = path.join(TEMPLATES_DIR, filename);
    const example = path.join(TEMPLATES_DIR, filename.replace(".csv", ".example.csv"));
    fs.writeFileSync(base, def.headers + "\n");
    fs.writeFileSync(example, [def.headers, ...def.examples].join("\n") + "\n");
    written += 2;
    console.log(`✅ ${path.basename(base)} (+example) — ${def.description}`);
  }

  console.log(`\nTotal files written: ${written}`);
}

main();
