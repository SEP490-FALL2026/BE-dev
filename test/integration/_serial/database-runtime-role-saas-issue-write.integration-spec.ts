import {
  reconcileDatabaseRoles,
  verifyDatabaseRoles,
} from '../../../src/infrastructure/database/roles/database-role-provisioning';
import { prepareRoleDatabase, sessionRoleOf } from '../../support/role-database-prepare';
import {
  dropRoleSeparatedDatabase,
  withClient,
  type RoleSeparatedDatabase,
} from '../../support/role-separated-database';
import { SaasIssueHarness, type IssueWire } from '../../support/saas-issue-harness';
import type { Person } from '../../support/request-harness';

/**
 * H7-SEQ, the live incident: `POST /saas-issues` failed with SQLSTATE 42501 "permission denied for sequence saas_issue_seq" as
 * the runtime role. The numbering of a BM-11 report (`SaasIssueRepo.nextCode`) reads the state of the legacy sequence and lifts
 * it with `setval`, which needs SELECT and UPDATE on it. This file is the whole application path as the runtime role — HTTP,
 * service, repository, Audit Trail — across a reconcile, with the lift both taken (sequence behind the counter) and skipped
 * (sequence ahead). The ACLs, the verifier and the controls are in `database-runtime-sequences.integration-spec.ts`.
 *
 * One application for each file (see `database-runtime-role-budget-write.integration-spec.ts`); BM-09 is in
 * `database-runtime-role-notice-write.integration-spec.ts`.
 */
describe('a BM-11 report is numbered as the runtime role, across a reconcile (integration, PostgreSQL)', () => {
  const h = new SaasIssueHarness();
  let database: RoleSeparatedDatabase;
  let figma: { subscriptionId: string };
  let it1: Person;
  let sequence = 0;

  /** One more report, by a new member of a new department with a seat (a person may report a right once while it is open). */
  const report = async (): Promise<IssueWire> => {
    sequence += 1;
    const { member, assignmentId } = await h.reporterIn(`P-RS${sequence}`, it1, figma);

    return h.reported(member.account, assignmentId);
  };
  const parts = (issue: IssueWire): { year: number; number: number } => {
    const match = /^BM11-(\d{4})-(\d{6})$/.exec(issue.code);
    if (!match) throw new Error(`not a BM-11 code: ${issue.code}`);

    return { year: Number(match[1]), number: Number(match[2]) };
  };
  const sequenceState = async (): Promise<number> =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT (CASE WHEN is_called THEN last_value ELSE last_value - 1 END)::text AS n FROM saas_issue_seq`,
        )
      ).rows[0].n,
    );
  const counterOf = async (year: number): Promise<number> =>
    (
      await h.ctx.sql.query<{ last_value: number }>(`SELECT last_value FROM saas_issue_counters WHERE year = $1`, [
        year,
      ])
    ).rows[0].last_value;
  const reconcile = () =>
    withClient(database.deploy.url, (client) => reconcileDatabaseRoles(client, database.runtime.role));
  const verify = () => withClient(database.deploy.url, (client) => verifyDatabaseRoles(client, database.runtime.role));
  const aclOfIssueSequence = async (): Promise<string> =>
    (
      await withClient(database.bootstrapUrl, (client) =>
        client.query<{ privileges: string }>(
          `SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
             FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
            WHERE c.oid = 'public.saas_issue_seq'::regclass AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $1)`,
          [database.runtime.role],
        ),
      )
    ).rows[0].privileges;

  beforeAll(async () => {
    database = await prepareRoleDatabase();
    await h.start({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
    figma = { subscriptionId: await h.subscription(80, 'K2') };
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
  }, 300000);

  afterAll(async () => {
    await h.stop();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('numbers the reports of one year 1, 2, 3 with an audit event each, taking the lift of the sequence', async () => {
    const first = await report();
    const second = await report();

    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    expect(await aclOfIssueSequence()).toBe('SELECT,UPDATE');
    expect([parts(first).number, parts(second).number]).toEqual([1, 2]);
    expect(parts(second).year).toBe(parts(first).year);
    expect(await sequenceState()).toBe(2);
    expect(await counterOf(parts(first).year)).toBe(2);
    for (const issue of [first, second]) {
      expect(await h.issueEvents('SAAS_ISSUE.SUBMITTED', issue.id)).toHaveLength(1);
      expect((await h.issueRow(issue.id)).state).toBe('NEW');
    }
    expect(await h.issueCount()).toBe(2);
  });

  it('numbers a report while the sequence is far ahead of the counter: it is only read, never lowered', async () => {
    await h.ctx.sql.query(`SELECT setval('saas_issue_seq', 5000, true)`);

    const third = await report();

    expect(parts(third).number).toBe(3);
    expect(await sequenceState()).toBe(5000);
    expect(await counterOf(parts(third).year)).toBe(3);
  });

  it('keeps numbering after a reconcile and a verify: unique, increasing, the lift taken again when the sequence is behind', async () => {
    const issued = (await h.ctx.sql.query<{ code: string }>(`SELECT code FROM saas_issues ORDER BY code`)).rows.map(
      (row) => row.code,
    );
    const reconciled = await reconcile();
    const verified = await verify();

    expect(reconciled).toMatchObject({ outcome: 'DONE', findings: [] });
    expect(verified).toMatchObject({ outcome: 'CONSISTENT', findings: [] });
    expect(await aclOfIssueSequence()).toBe('SELECT,UPDATE');

    const fourth = await report();
    // The compatibility image drew from the old sequence meanwhile: it is behind the counter that was set ahead of it.
    await h.ctx.sql.query(`SELECT setval('saas_issue_seq', 1, false)`);
    await h.ctx.sql.query(`UPDATE saas_issue_counters SET last_value = 41 WHERE year = $1`, [parts(fourth).year]);
    const lifted = await report();

    expect(issued).toHaveLength(3);
    expect([parts(fourth).number, parts(lifted).number]).toEqual([4, 42]);
    expect(await sequenceState()).toBeGreaterThanOrEqual(42);
    const codes = (
      await h.ctx.sql.query<{ code: string }>(`SELECT code FROM saas_issues ORDER BY created_at, id`)
    ).rows.map((row) => row.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.map((code) => Number(code.slice(-6)))).toEqual([1, 2, 3, 4, 42]);
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
  });
});
