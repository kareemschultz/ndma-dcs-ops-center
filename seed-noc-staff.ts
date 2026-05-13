import { db } from "@ndma-dcs-staff-portal/db";
import { user } from "@ndma-dcs-staff-portal/db/schema/auth";
import { staffProfiles } from "@ndma-dcs-staff-portal/db/schema/staff";

const nocStaff = [
  { id: "user-dennis",     name: "Dennis Southwell",       email: "dennis.southwell@ndma.gov",      role: "staff" },
  { id: "user-ganesh",     name: "Ganesh Mansram",         email: "ganesh.mansram@ndma.gov",        role: "teamLead" },
  { id: "user-stefan",     name: "Stefan Hopkinson",       email: "stefan.hopkinson@ndma.gov",      role: "staff" },
  { id: "user-shameer",    name: "Shameer Ally",           email: "shameer.ally@ndma.gov",          role: "staff" },
  { id: "user-ayeldre",    name: "Ayeldre Christie",       email: "ayeldre.christie@ndma.gov",      role: "staff" },
  { id: "user-keoma",      name: "Keoma Grant",            email: "keoma.grant@ndma.gov",           role: "staff" },
  { id: "user-asif",       name: "Asif Khan",              email: "asif.khan@ndma.gov",             role: "staff" },
  { id: "user-wynonna",    name: "Wynonna Watson",         email: "wynonna.watson@ndma.gov",        role: "staff" },
  { id: "user-randolph",   name: "Randolph Morrison",      email: "randolph.morrison@ndma.gov",     role: "staff" },
  { id: "user-joshua",     name: "Joshua Deygoo",          email: "joshua.deygoo@ndma.gov",         role: "staff" },
  { id: "user-marcellous", name: "Marcellous Bhagwandeen", email: "marcellous.bhagwandeen@ndma.gov",role: "staff" },
  { id: "user-joel",       name: "Joel Samuels",           email: "joel.samuels@ndma.gov",          role: "staff" },
];

const now = new Date();
let created = 0;
for (const s of nocStaff) {
  const empId = `NOC-${String(created + 1).padStart(3, "0")}`;
  await db.insert(user).values({ id: s.id, name: s.name, email: s.email, emailVerified: true, role: s.role, createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(staffProfiles).values({ userId: s.id, employeeId: empId, departmentId: "dept-noc", jobTitle: "NOC Technician", employmentType: "contract", status: "active", createdAt: now, updatedAt: now }).onConflictDoNothing();
  created++;
  console.log(`  + ${s.name} (${empId})`);
}
console.log(`\n✅ Created ${created} NOC staff members`);
