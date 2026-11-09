import {
  reconcileDatabaseRoles,
  verifyDatabaseRoles,
} from '../../../src/infrastructure/database/roles/database-role-provisioning';
import { NoticeHarness, type NoticeWire } from '../../support/notice-harness';
import { prepareRoleDatabase, sessionRoleOf } from '../../support/role-database-prepare';
import {
  dropRoleSeparatedDatabase,
  withClient,
  type RoleSeparatedDatabase,
} from '../../support/role-separated-database';
import type { Department, Person } from '../../support/request-harness';

/**
 * H7-SEQ: the sending of a BM-09 notice (`POST /personnel-notices`) as the runtime role. The numbering of a notice
 * (`NoticeRepo.nextCode`) reads the state of the legacy sequence and lifts it with `setval`, which needs SELECT and UPDATE on it
 * — the same need as BM-11 (`database-runtime-role-saas-issue-write.integration-spec.ts`), in another module. The whole application
 * path runs as the runtime role: HTTP, service, repository, Audit Trail, across a reconcile, with the lift both taken (sequence
 * behind the counter) and skipped (sequence ahead). The ACLs, the verifier and the controls are in
 * `database-runtime-sequences.integration-spec.ts`.
 *
 * One application for each file (see `database-runtime-role-budget-write.integration-spec.ts`).
 */
describe('a BM-09 notice is numbered as the runtime role, across a reconcile (integration, PostgreSQL)', () => {
  const h = new NoticeHarness();
  let database: RoleSeparatedDatabase;
  let department: Department;
  let head: Person;
  let sequence = 0;

  /** One more notice of a departure of a new person of the department of the head (a person has one pending notice at a time). */
  const send = async (): Promise<NoticeWire> => {
    sequence += 1;
    const person = await h.worker(department, `E-RN${sequence}`);

    return h.sentNotice(
      { employeeId: person.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5), note: 'Resignation letter received' },
      head.account,
    );
  };
  const parts = (notice: NoticeWire): { year: number; number: number } => {
    const match = /^BM09-(\d{4})-(\d{6})$/.exec(notice.code);
    if (!match) throw new Error(`not a BM-09 code: ${notice.code}`);

    return { year: Number(match[1]), number: Number(match[2]) };
  };
  const sequenceState = async (): Promise<number> =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT (CASE WHEN is_called THEN last_value ELSE last_value - 1 END)::text AS n FROM personnel_notice_seq`,
        )
      ).rows[0].n,
    );
  const counterOf = async (year: number): Promise<number> =>
    (
      await h.ctx.sql.query<{ last_value: number }>(
        `SELECT last_value FROM personnel_notice_counters WHERE year = $1`,
        [year],
      )
    ).rows[0].last_value;
  const auditCount = async (noticeId: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE resource_id = $1`, [
        noticeId,
      ])
    ).rows[0].n;
  const reconcile = () =>
    withClient(database.deploy.url, (client) => reconcileDatabaseRoles(client, database.runtime.role));
  const verify = () => withClient(database.deploy.url, (client) => verifyDatabaseRoles(client, database.runtime.role));
  const aclOfNoticeSequence = async (): Promise<string> =>
    (
      await withClient(database.bootstrapUrl, (client) =>
        client.query<{ privileges: string }>(
          `SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
             FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
            WHERE c.oid = 'public.personnel_notice_seq'::regclass AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $1)`,
          [database.runtime.role],
        ),
      )
    ).rows[0].privileges;

  beforeAll(async () => {
    database = await prepareRoleDatabase();
    await h.start({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
    department = { ...(await h.department('N-RDES', h.it1.employeeId)), unitId: '' };
    head = await h.head(department, 'H1-RN');
  }, 300000);

  afterAll(async () => {
    await h.stop();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('numbers the notices of one year 1, 2 with an audit event each, taking the lift of the sequence', async () => {
    const first = await send();
    const second = await send();

    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    expect(await aclOfNoticeSequence()).toBe('SELECT,UPDATE');
    expect([parts(first).number, parts(second).number]).toEqual([1, 2]);
    expect(parts(second).year).toBe(parts(first).year);
    expect(await sequenceState()).toBe(2);
    expect(await counterOf(parts(first).year)).toBe(2);
    for (const notice of [first, second]) {
      expect(notice).toMatchObject({ status: 'PENDING_VERIFICATION', kind: 'DEPARTURE' });
      expect(await auditCount(notice.id)).toBeGreaterThanOrEqual(1);
    }
    expect(await h.noticeCount()).toBe(2);
  });

  it('numbers a notice while the sequence is far ahead of the counter: it is only read, never lowered', async () => {
    await h.ctx.sql.query(`SELECT setval('personnel_notice_seq', 5000, true)`);

    const third = await send();

    expect(parts(third).number).toBe(3);
    expect(await sequenceState()).toBe(5000);
    expect(await counterOf(parts(third).year)).toBe(3);
  });

  it('keeps numbering after a reconcile and a verify: unique, increasing, the lift taken again when the sequence is behind', async () => {
    const reconciled = await reconcile();
    const verified = await verify();

    expect(reconciled).toMatchObject({ outcome: 'DONE', findings: [] });
    expect(verified).toMatchObject({ outcome: 'CONSISTENT', findings: [] });
    expect(await aclOfNoticeSequence()).toBe('SELECT,UPDATE');

    const fourth = await send();
    // The compatibility image drew from the old sequence meanwhile: it is behind the counter that was set ahead of it.
    await h.ctx.sql.query(`SELECT setval('personnel_notice_seq', 1, false)`);
    await h.ctx.sql.query(`UPDATE personnel_notice_counters SET last_value = 41 WHERE year = $1`, [parts(fourth).year]);
    const lifted = await send();

    expect([parts(fourth).number, parts(lifted).number]).toEqual([4, 42]);
    expect(await sequenceState()).toBeGreaterThanOrEqual(42);
    const codes = (
      await h.ctx.sql.query<{ code: string }>(`SELECT code FROM personnel_notices ORDER BY created_at, id`)
    ).rows.map((row) => row.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.map((code) => Number(code.slice(-6)))).toEqual([1, 2, 3, 4, 42]);
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
  });
});
