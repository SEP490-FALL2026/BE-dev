import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../support/cli-process';
import { activateCostCenterLink, lastCompatibilityMigration } from '../support/compat-release';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { expansionWorld, ExpansionWorld } from '../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.3a and 1.3 (F41, spec L.4): the live inventory of `ops:preflight` for the two
 * kinds the final release no longer takes — a `BM-09` notice of a change of job title that still waits, and a
 * transfer of the job title only that still waits. They block before and after the compatibility migration, by id and
 * nothing else, through partial closing, until the last one is rejected or cancelled; the rows `7c28e75` writes after the
 * migration or after a recovery are listed the same way. Once the final migrations have run (they refuse to run over such a row)
 * nothing is listed. The command is real (`migration-preflight-cli.ts` through ts-node) on a database whose history Prisma
 * recorded itself.
 */
const TEXT = migrationEndingWith('_job_title_text');

interface Report {
  status: 'READY' | 'BLOCKED';
  blockers: Array<{ code: string; noticeId?: string; transferId?: string }>;
}

describe('ops:preflight, the retired kinds of notice and transfer (integration, real CLI and PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  let counter = 0;
  const titles = { first: randomUUID(), second: randomUUID() };

  const preflight = async (): Promise<{ code: number | null; report: Report }> => {
    const result = await runCli('migration-preflight-cli.ts', ['--json'], {
      cwd: cliWorkingDirectory('slm-preflight-title'),
      environment: { NODE_ENV: 'production', DATABASE_URL: database.url },
    });
    if (result.code !== 0 && result.code !== 2) throw new Error(`preflight ${result.code}: ${result.stderr}`);

    return { code: result.code, report: JSON.parse(result.stdout) as Report };
  };
  const retired = (report: Report) =>
    report.blockers.filter((blocker) => /^(PERSONNEL_NOTICE|DEPARTMENT_TRANSFER)/.test(blocker.code));
  const person = async (): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, 'Someone', 'STAFF', '2026-01-01', now())`,
      [id, world.organizationId, `RK-${counter}`],
    );

    return id;
  };
  /** A notice as the previous release writes one: the head of the department tells of a change of job title. */
  const titleNotice = async (kind = 'JOB_TITLE_CHANGE'): Promise<string> => {
    const employee = await person();
    counter += 1;
    const id = randomUUID();
    await sql.query(
      `INSERT INTO personnel_notices (id, code, organization_id, employee_id, kind, proposed_on, sender_employee_id,
                                      sender_department_id, due_on)
       VALUES ($1, $2, $3, $4, $5::"PersonnelNoticeKind", '2030-01-10', $6, $7, '2030-01-12')`,
      [
        id,
        `BM09-2030-${String(counter).padStart(6, '0')}`,
        world.organizationId,
        employee,
        kind,
        world.ownerEmployeeId,
        world.departments.eng,
      ],
    );

    return id;
  };
  /** A transfer as the previous release writes one: waiting, with the department kept and the title changed. */
  const transfer = async (
    departments: { from: string; to: string },
    titleIds: { from: string; to: string },
  ): Promise<string> => {
    const employee = await person();
    const id = randomUUID();
    await sql.query(
      `INSERT INTO department_transfers (id, organization_id, employee_id, from_department_id, to_department_id,
         from_job_title_id, to_job_title_id, effective_on, closes_placement_id, opens_placement_id, grounds_type,
         grounds_reference, grounds_issuer, grounds_issued_on, recorded_by_app_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '2030-02-01', gen_random_uuid(), gen_random_uuid(), 'DECISION', 'D-1', 'HR', '2030-01-01', gen_random_uuid())`,
      [id, world.organizationId, employee, departments.from, departments.to, titleIds.from, titleIds.to],
    );

    return id;
  };
  const sorted = (ids: string[]) => [...ids].sort();
  /** What the report lists: by code, then by id — the transfers come before the notices. */
  const blockersOf = (noticeIds: string[], transferIds: string[]) => [
    ...sorted(transferIds).map((transferId) => ({ code: 'DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING', transferId })),
    ...sorted(noticeIds).map((noticeId) => ({ code: 'PERSONNEL_NOTICE_RETIRED_KIND_PENDING', noticeId })),
  ];

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it(
    'an empty database has neither table: ready, nothing to list',
    async () => {
      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(retired(report)).toEqual([]);
    },
    CLI_COLD_START_MS,
  );

  let notices: string[] = [];
  let transfers: string[] = [];

  it(
    'before the compatibility migration: blocks by id for each waiting notice of the retired kind and each waiting transfer of the title only, and not for anything else',
    async () => {
      const before = await deployMigrations(database, { through: migrationBefore(TEXT) });
      if (before.code !== 0)
        throw new Error(`Deploying the history before the title migration failed: ${before.stdout}`);
      world = await expansionWorld(sql);
      await sql.query(
        `INSERT INTO job_titles (id, organization_id, name, normalized_name) VALUES
           ($1, $3, 'Engineer', 'engineer'), ($2, $3, 'Senior Engineer', 'senior engineer')`,
        [titles.first, titles.second, world.organizationId],
      );
      notices = [await titleNotice(), await titleNotice()];
      transfers = [
        await transfer(
          { from: world.departments.eng, to: world.departments.eng },
          { from: titles.first, to: titles.second },
        ),
      ];
      // Neither of these is of a retired kind: a departure notice, and a transfer that changes the department.
      await titleNotice('DEPARTURE');
      await transfer(
        { from: world.departments.eng, to: world.departments.ops },
        { from: titles.first, to: titles.first },
      );

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.status).toBe('BLOCKED');
      expect(retired(report)).toEqual(blockersOf(notices, transfers));
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'after the compatibility migration: the same rows still block, including one the previous release writes late',
    async () => {
      const deploy = await deployMigrations(database, { through: lastCompatibilityMigration() });
      if (deploy.code !== 0) throw new Error(`Deploying the compatibility release failed: ${deploy.stdout}`);
      // The previous release is still the running one in the migrate → recreate window, or recovered after a failed deploy.
      const late = await titleNotice();
      notices.push(late);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(retired(report)).toEqual(blockersOf(notices, transfers));
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'stays blocked through partial closing, for the rows still waiting, and is ready once the last is rejected or cancelled',
    async () => {
      const reject = (id: string) =>
        sql.query(
          `UPDATE personnel_notices SET status = 'REJECTED', reject_reason = 'Loại BM-09 đã bỏ (QĐ-87e, D-1)',
                  handled_by_app_user_id = gen_random_uuid(), handled_at = now() WHERE id = $1`,
          [id],
        );
      await reject(notices[0]);
      const partial = await preflight();
      expect(partial.code).toBe(2);
      expect(retired(partial.report)).toEqual(blockersOf(notices.slice(1), transfers));

      for (const id of notices.slice(1)) await reject(id);
      await sql.query(
        `UPDATE department_transfers SET status = 'CANCELLED', cancelled_at = now(), cancelled_by_app_user_id = gen_random_uuid(),
                cancelled_reason = 'Điều chuyển chỉ đổi chức vụ đã bỏ (QĐ-87e, D-1)' WHERE id = ANY($1::uuid[])`,
        [transfers],
      );

      const { code, report } = await preflight();

      expect(retired(report)).toEqual([]);
      expect(
        code === 0 || report.blockers.every((blocker) => !/^(PERSONNEL_NOTICE|DEPARTMENT_TRANSFER)/.test(blocker.code)),
      ).toBe(true);
    },
    CLI_COLD_START_MS * 2,
  );

  it(
    'after the migrations of the final release (the catalogue, the four columns and the other tables are gone): nothing is listed and the preflight is ready',
    async () => {
      // The operator's step on the compatibility release, so that only the kinds that are gone are read here.
      await activateCostCenterLink(sql, world.organizationId);
      const deploy = await deployMigrations(database);
      if (deploy.code !== 0) throw new Error(`Deploying the final release failed: ${deploy.stdout}\n${deploy.stderr}`);

      const { code, report } = await preflight();

      expect(retired(report)).toEqual([]);
      expect(code).toBe(0);
      expect(report).toMatchObject({ status: 'READY', blockers: [] });
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );
});
