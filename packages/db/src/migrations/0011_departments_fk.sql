ALTER TABLE "departments" ADD CONSTRAINT "fk_departments_parent"
  FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL;
