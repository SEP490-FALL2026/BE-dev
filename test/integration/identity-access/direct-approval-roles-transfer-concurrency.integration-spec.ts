import { Client } from 'pg';
import { waitForLockWaiters } from '../../support/lock-wait';
import { TransferHarness } from '../../support/transfer-harness';

/**
 * The event of the personnel context that names the successor of a head who leaves holds the account of the successor `FOR SHARE` to
 * the end of its transaction; the revoke of MANAGER holds it `FOR UPDATE` (spec › Người kế nhiệm trong sự kiện nhân sự, QĐ-93a).
 */
describe('a transfer that names a successor and the revoke of MANAGER of that successor (integration, real PostgreSQL)', () => {
  const t = new TransferHarness();
  let holder: Client;
  let sequence = 0;

  beforeAll(async () => {
    await t.start();
    holder = new Client({ connectionString: t.ctx.database.url });
    await holder.connect();
  }, 300000);

  afterAll(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
    await holder.end();
    await t.stop();
  });

  const scene = async () => {
    sequence += 1;
    const home = await t.departmentWithUnit(`P-CC${sequence}`);
    const target = await t.departmentWithUnit(`P-CT${sequence}`);
    const head = await t.veteran(home, `CH${sequence}`);
    await t.makeHead(home, head);
    const heir = await t.veteran(home, `CI${sequence}`, ['MANAGER']);
    const record = () =>
      t
        .recordTransfer({
          employeeId: head.employeeId,
          toDepartmentId: target.id,
          effectiveOn: t.day(30),
          groundsNote: t.groundsNote,
          successor: { kind: 'EMPLOYEE', employeeId: heir.employeeId },
        })
        .then((response) => response);
    const revoke = () => t.changeRoleOf(heir.account.appUserId, 'EMPLOYEE').then((response) => response);
    const heirPeriods = async () =>
      Number(
        (
          await t.ctx.sql.query<{ n: string }>(
            'SELECT count(*) AS n FROM department_head_periods WHERE employee_id = $1',
            [heir.employeeId],
          )
        ).rows[0].n,
      );
    const heirRoles = async () =>
      (
        await t.ctx.sql.query<{ role: string }>(
          `SELECT role::text FROM role_grants WHERE app_user_id = $1 AND revoked_at IS NULL`,
          [heir.account.appUserId],
        )
      ).rows.map((row) => row.role);

    return { heir, record, revoke, heirPeriods, heirRoles };
  };
  const holdAccount = async (appUserId: string) => {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [appUserId]);
  };

  it('revoke first: the transfer finds no MANAGER (422 MANAGER_ROLE_REQUIRED) and writes nothing', async () => {
    const { heir, record, revoke, heirPeriods, heirRoles } = await scene();
    await holdAccount(heir.account.appUserId);

    const revoked = revoke();
    await waitForLockWaiters(t.ctx.sql, 1);
    const recorded = record();
    await waitForLockWaiters(t.ctx.sql, 2);
    await holder.query('COMMIT');
    const [revokeAnswer, recordAnswer] = await Promise.all([revoked, recorded]);

    expect(revokeAnswer.status).toBe(200);
    expect([recordAnswer.status, t.codeOf(recordAnswer), t.detailsOf(recordAnswer)]).toEqual([
      422,
      'DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
      { reason: 'MANAGER_ROLE_REQUIRED' },
    ]);
    expect(await heirPeriods()).toBe(0);
    expect(await heirRoles()).not.toContain('MANAGER');
  });

  it('transfer first: the revoke then sees the period of the successor and is refused with 409, never a 500', async () => {
    const { heir, record, revoke, heirPeriods, heirRoles } = await scene();
    await holdAccount(heir.account.appUserId);

    const recorded = record();
    await waitForLockWaiters(t.ctx.sql, 1);
    const revoked = revoke();
    await waitForLockWaiters(t.ctx.sql, 2);
    await holder.query('COMMIT');
    const [recordAnswer, revokeAnswer] = await Promise.all([recorded, revoked]);

    expect(recordAnswer.status).toBe(201);
    expect([revokeAnswer.status, t.codeOf(revokeAnswer)]).toEqual([409, 'APP_USER.MANAGER_STILL_HEADING']);
    expect(await heirPeriods()).toBe(1);
    expect(await heirRoles()).toContain('MANAGER');
  });
});
