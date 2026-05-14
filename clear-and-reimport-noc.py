"""
NOC Shift DB Cleanup Script
============================
Run this ONCE to delete the incorrectly seeded NOC shift data (Jan-May 2026).
After running, use the "Import Excel" button in the UI for each month (Jan-Apr).
May 2026 has no source Excel file — it will remain blank.

Why this is needed:
  • The seed-historical.ts script mapped "S" → "Day Shift" instead of "Swing Shift"
  • The seed-scheduling-demo.ts seeded May with DCS staff IDs (wrong staff)
  • Re-importing via the UI uses the correct parser (S → Swing Shift)

Usage:
  python clear-and-reimport-noc.py

Requires: pip install psycopg2-binary
"""

import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    user="postgres",
    password="password",
    database="ndma_dcs_portal",
)
conn.autocommit = False

noc_staff_ids = [
    "sp-dennis", "sp-ganesh", "sp-stefan", "sp-ayeldre", "sp-shameer",
    "sp-keoma", "sp-asif", "sp-wynonna", "sp-morrison", "sp-joshua",
]

try:
    cur = conn.cursor()

    # Count before
    cur.execute("""
        SELECT COUNT(*) FROM noc_shifts
        WHERE shift_date >= '2026-01-01' AND shift_date <= '2026-05-31'
    """)
    before = cur.fetchone()[0]
    print(f"Records before cleanup: {before}")

    # Show breakdown
    cur.execute("""
        SELECT staff_id, SUBSTRING(shift_date, 1, 7) as month, COUNT(*) as cnt,
               COUNT(CASE WHEN shift_type = 'Swing Shift' THEN 1 END) as swing,
               COUNT(CASE WHEN shift_type = 'Day Shift' THEN 1 END) as day_shifts
        FROM noc_shifts
        WHERE shift_date >= '2026-01-01' AND shift_date <= '2026-05-31'
        GROUP BY staff_id, month
        ORDER BY month, staff_id
    """)
    print("\nCurrent data summary (before delete):")
    print(f"{'Staff':<20} {'Month':<10} {'Total':<8} {'Swing':<8} {'Day':<8}")
    for row in cur.fetchall():
        print(f"{row[0]:<20} {row[1]:<10} {row[2]:<8} {row[3]:<8} {row[4]:<8}")

    # Delete Jan-May 2026 NOC shifts
    cur.execute("""
        DELETE FROM noc_shifts
        WHERE shift_date >= '2026-01-01'
          AND shift_date <= '2026-05-31'
          AND staff_id = ANY(%s)
    """, (noc_staff_ids,))

    deleted = cur.rowcount
    print(f"\nDeleted {deleted} rows")

    conn.commit()

    # Verify
    cur.execute("""
        SELECT COUNT(*) FROM noc_shifts
        WHERE shift_date >= '2026-01-01' AND shift_date <= '2026-05-31'
          AND staff_id = ANY(%s)
    """, (noc_staff_ids,))
    after = cur.fetchone()[0]
    print(f"Records remaining for NOC staff Jan-May 2026: {after}")
    print("\n✅ Done! Now use the NOC Shifts page → Import Excel for Jan, Feb, Mar, Apr 2026.")
    print("   May 2026 has no Excel source — leave blank or import when available.")

except Exception as e:
    conn.rollback()
    print(f"ERROR: {e}")
    raise
finally:
    conn.close()
