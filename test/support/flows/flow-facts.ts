import type { Client } from 'pg';

/** What a scenario reads of the database after a call: counts, a row, the notices and the audit trail. Only `SELECT`s. */
export class FlowFacts {
  constructor(private readonly sql: Client) {}

  /** The rows of a table of the application (the name is never taken from a request). */
  async count(table: string, where = 'true', values: unknown[] = []): Promise<number> {
    if (!/^[a-z_]+$/.test(table)) throw new Error(`Not a table name: ${table}`);
    const { rows } = await this.sql.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, values);

    return Number(rows[0].n);
  }

  async rows<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
    return (await this.sql.query<T>(text, values)).rows;
  }

  async one<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T> {
    const { rows } = await this.sql.query<T>(text, values);
    if (rows.length !== 1) throw new Error(`Expected one row, got ${rows.length}: ${text}`);

    return rows[0];
  }

  /** The notices of a code about a subject, oldest first, with who was told. */
  notices(code: string, subjectId: string) {
    return this.rows<{ recipient_employee_id: string; params: Record<string, unknown> }>(
      `SELECT recipient_employee_id, params FROM in_app_notifications WHERE code = $1 AND subject_id = $2 ORDER BY created_at, id`,
      [code, subjectId],
    );
  }

  /** The actions of the audit trail about a resource, oldest first. */
  async audit(resourceId: string): Promise<string[]> {
    const rows = await this.rows<{ action: string }>(
      `SELECT action FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id`,
      [resourceId],
    );

    return rows.map((row) => row.action);
  }

  /** The id of the employee with a code of the dataset. */
  async employeeId(code: string): Promise<string> {
    return (await this.one<{ id: string }>(`SELECT id FROM employees WHERE employee_code = $1`, [code])).id;
  }
}
