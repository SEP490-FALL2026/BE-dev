import type { Client } from 'pg';
import type { Test } from 'supertest';

/**
 * The files of the budget a suite only stands on (`QĐ-111ab`, `QĐ-111ac`): `BM-10` names one file at least and a version is sent with one
 * at least. A suite that is not about the files gets a row the database takes as uploaded (a proposal) or attached (a version), written the
 * way the routes leave it, without the object store. The suites of the files and of the rule of one file at least call the routes.
 */

/** A file uploaded by the person for a proposal and not attached yet: what `attachmentIds` of `BM-10` names. */
export async function uploadedProposalFile(sql: Client, employeeId: string): Promise<string> {
  const { rows } = await sql.query<{ id: string }>(
    `INSERT INTO budget_attachments (id, organization_id, target, file_name, content_type, size_bytes, object_key, uploaded_by_employee_id)
     SELECT gen_random_uuid(), e.organization_id, 'PROPOSAL', 'BM-10.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1000, 'test/budget/' || gen_random_uuid(), e.id
       FROM employees e WHERE e.id = $1
     RETURNING id`,
    [employeeId],
  );
  if (rows.length === 0) throw new Error(`no employee ${employeeId} to upload a file for`);
  await sql.query(
    `UPDATE budget_attachments SET status = 'UPLOADED', final_object_key = 'test/budget/final/' || id WHERE id = $1`,
    [rows[0].id],
  );

  return rows[0].id;
}

/**
 * A file attached to the version, when it can take one (a draft or one sent back, not detached) and has none yet: a version that cannot
 * take one is left as it is, so that the route answers what it answers for that version.
 */
export async function attachedVersionFile(sql: Client, versionId: string, employeeId: string): Promise<void> {
  const { rows } = await sql.query<{ id: string }>(
    `INSERT INTO budget_attachments (id, organization_id, target, file_name, content_type, size_bytes, object_key, uploaded_by_employee_id, version_id)
     SELECT gen_random_uuid(), v.organization_id, 'VERSION', 'explanation.pdf', 'application/pdf', 1000,
            'test/budget/' || gen_random_uuid(), $2, v.id
       FROM budget_versions v
      WHERE v.id = $1 AND v.state IN ('DRAFT', 'CHANGES_REQUESTED') AND v.detached_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM budget_attachments a WHERE a.version_id = v.id AND a.status = 'ATTACHED')
     RETURNING id`,
    [versionId, employeeId],
  );
  if (rows.length === 0) return;
  await sql.query(
    `UPDATE budget_attachments SET status = 'ATTACHED', final_object_key = 'test/budget/final/' || id, attached_at = now() WHERE id = $1`,
    [rows[0].id],
  );
}

/** The request is sent only after `prepare` has run, however the suite waits for it (`await`, `.expect`, `.then`). */
export function afterPreparing<T extends Test>(test: T, prepare: () => Promise<void>): T {
  const end = test.end.bind(test);
  const deferred = (callback?: Parameters<Test['end']>[0]): T => {
    prepare().then(
      () => end(callback),
      (error: unknown) => callback?.(error as Error, undefined as never),
    );

    return test;
  };
  test.end = deferred;

  return test;
}

/**
 * The body of `BM-10` with one uploaded file when the suite names none: the file is uploaded just before the request is sent and named in
 * the body the request holds (superagent copies the fields of `send` into its own body, which is serialized when the request ends).
 */
export function withProposalFile<T extends Test>(
  test: T,
  sql: Client,
  employeeId: string,
  body: { attachmentIds?: unknown },
): T {
  return body.attachmentIds !== undefined
    ? test
    : afterPreparing(test, async () => {
        const held = (test as unknown as { _data: Record<string, unknown> })._data;
        held.attachmentIds = [await uploadedProposalFile(sql, employeeId)];
      });
}

/**
 * Temporarily moves an open cycle's submission deadline to yesterday while a version submission runs, then restores it
 * once the last concurrent send for that cycle finishes so later proposals on the same year remain open.
 */
export class SendingCycleLock {
  private chain: Promise<void> = Promise.resolve();
  private active = new Map<string, { organizationId: string; year: number; originalDeadline: string; count: number }>();

  async run<T>(sql: Client, versionId: string, today: string, work: () => Promise<T>): Promise<T> {
    const key = await this.acquire(sql, versionId, today);
    try {
      return await work();
    } finally {
      await this.release(sql, key);
    }
  }

  wrap<T extends Test>(sql: Client, versionId: string, today: string, test: T): T {
    const innerEnd = test.end.bind(test);
    test.end = (callback?: Parameters<Test['end']>[0]): T => {
      this.acquire(sql, versionId, today).then(
        (key) =>
          innerEnd((error, response) => {
            this.release(sql, key).then(
              () => callback?.(error, response),
              (releaseError: unknown) => callback?.((error ?? releaseError) as Error, response),
            );
          }),
        (acquireError: unknown) => callback?.(acquireError as Error, undefined as never),
      );

      return test;
    };

    return test;
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  private acquire(sql: Client, versionId: string, today: string): Promise<string | null> {
    return this.serialize(async () => {
      const { rows } = await sql.query<{ organizationId: string; year: number; deadline: string }>(
        `SELECT c.organization_id AS "organizationId", c.year, c.submission_deadline::text AS deadline
           FROM budget_versions v
           JOIN budget_cycles c ON c.organization_id = v.organization_id AND c.year = v.year
          WHERE v.id = $1 AND c.opened_at IS NOT NULL`,
        [versionId],
      );
      if (rows.length === 0) return null;
      const { organizationId, year, deadline } = rows[0];
      const key = `${organizationId}:${year}`;
      const existing = this.active.get(key);
      if (existing) {
        existing.count += 1;

        return key;
      }
      if (deadline < today) return null;
      await sql.query(
        `UPDATE budget_cycles SET submission_deadline = $3::date - 1 WHERE organization_id = $1 AND year = $2`,
        [organizationId, year, today],
      );
      this.active.set(key, { organizationId, year, originalDeadline: deadline, count: 1 });

      return key;
    });
  }

  private async release(sql: Client, key: string | null): Promise<void> {
    if (key === null) return;
    await this.serialize(async () => {
      const existing = this.active.get(key);
      if (!existing) return;
      existing.count -= 1;
      if (existing.count > 0) return;
      this.active.delete(key);
      await sql.query(
        `UPDATE budget_cycles SET submission_deadline = $3::date WHERE organization_id = $1 AND year = $2`,
        [existing.organizationId, existing.year, existing.originalDeadline],
      );
    });
  }
}

export const sendingCycleLock = new SendingCycleLock();
