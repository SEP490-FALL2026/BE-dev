import type { Client } from 'pg';

/**
 * A write of a fixture on `license_assignments` the immutability trigger refuses (the department that owns a seat is fixed when it is made):
 * the trigger is lifted for this one statement, so a seat can be set up as owned by a department, or by none (a seat of the shared pool).
 */
export async function withAssignmentsUnlocked(
  sql: Client,
  statement: string,
  values: unknown[],
): Promise<{ rows: Record<string, unknown>[] }> {
  await sql.query(`ALTER TABLE license_assignments DISABLE TRIGGER license_assignments_immutable`);
  try {
    return await sql.query(statement, values);
  } finally {
    await sql.query(`ALTER TABLE license_assignments ENABLE TRIGGER license_assignments_immutable`);
  }
}

/** The seat, still owned by no department, set up as owned by `departmentId` (a seat that is not of the shared pool). */
export async function ownSeatBy(sql: Client, assignmentId: string, departmentId: string): Promise<void> {
  await withAssignmentsUnlocked(
    sql,
    `UPDATE license_assignments SET owning_department_id = $2 WHERE id = $1 AND owning_department_id IS NULL`,
    [assignmentId, departmentId],
  );
}
