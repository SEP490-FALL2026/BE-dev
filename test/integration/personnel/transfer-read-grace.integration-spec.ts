import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { SystemActor } from '../../../src/modules/licensing/public/licensing.types';
import { graceOf } from '../../../src/modules/personnel/transfer-grace/transfer-grace.policy';
import { changeRoleTo } from '../../support/builders/account.builder';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;
const MONTHLY = BigInt(M);
const NONE: ReadonlySet<string> = new Set();

interface DetailWire {
  id: string;
  status: string;
  phase: string;
  grace: { endsOn: string; reminderOn: string } | null;
  groundsNote: string | null;
  closure: { closedAt: string; closedByAppUserId: string | null; closedBySystem: boolean } | null;
  oldRights: {
    assignmentId: string;
    state: 'HELD' | 'REVOKING' | 'ENDED';
    revocation: { taskId: string; status: string } | null;
    regranted: boolean;
    application: { name: string };
    provisioningType: string;
  }[];
  commitmentsReleased: { currency: string; amountMinor: string }[];
  snapshot: {
    before: { takenOn: string; rights: { assignmentId: string }[] } | null;
    after: unknown;
  } | null;
}
interface MineWire {
  id: string;
  from: { department: { id: string } };
  to: { department: { id: string } };
  effectiveOn: string;
  grace: { endsOn: string; reminderOn: string };
  rights: { assignmentId: string; state: string }[];
}

/**
 * `MF3-B.5` (P7, P8, `QĐ-110p`, R-21): what the Super Admin and the IT Admin read of a transfer — where it stands, the grace, the old rights
 * with the task that takes each away, the money that went back, the picture of the rights — and what the person reads of their own transfer while
 * the grace lasts. On real PostgreSQL, over HTTP.
 */
describe('reading a transfer and its grace (integration, real PostgreSQL)', () => {
  let subscriptionId: string;
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(40, 'K2');
    plan = await h.planOf(subscriptionId);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-RG${counter}`);
    await h.budgetFor(u, { total: 500 * M });
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = '2026-01-05' WHERE employee_id = $1`, [
      u.member.employeeId,
    ]);

    return u;
  };
  const seatAndCommitment = async (u: Unit): Promise<{ requestId: string; assignmentId: string }> => {
    const requestId = await h.waitingForApprover(u, plan, { amount: 12 * M });
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_months = 12, price_kind = 'RECURRING', expected_end_date = NULL, budget_year = $2 WHERE id = $1`,
      [requestId, h.year],
    );
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    await h.ctx.sql.query(`UPDATE budget_commitments SET seat_monthly_minor = NULL WHERE request_id = $1`, [requestId]);
    const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId, subscriptionId }).expect(201)).task;
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Added to the workspace' }).expect(200);
    await h.ctx.sql.query(`UPDATE budget_commitments SET seat_monthly_minor = $2 WHERE request_id = $1`, [
      requestId,
      MONTHLY.toString(),
    ]);
    const assignmentId = (
      await h.ctx.sql.query<{ assignment_id: string }>('SELECT assignment_id FROM provisioning_tasks WHERE id = $1', [
        task.id,
      ])
    ).rows[0].assignment_id;

    return { requestId, assignmentId };
  };
  const grace = () =>
    graceOf({
      effectiveOn: h.today(),
      notedOn: h.today(),
      workingDays: 5,
      reminderWorkingDays: 2,
      nonWorkingDates: NONE,
    });
  const detailOf = async (id: string, account = h.sa): Promise<DetailWire> =>
    h.dataOf<DetailWire>(await h.readTransfer(id, account).expect(200));
  const mine = async (account: { accessToken: string; appUserId: string; employeeId: string; email: string }) =>
    h.dataOf<MineWire | null>(
      await request(h.server()).get('/api/v1/me/department-transfer').set(h.as(account)).expect(200),
    );

  it('P7: a transfer that took effect is in grace, with the last day, the old rights, the money that went back and the picture of the rights', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-RG-DEST');
    const { assignmentId } = await seatAndCommitment(u);
    const wire = await h.moveToday(u.member, dest.department);

    const detail = await detailOf(wire.id);

    expect(detail).toMatchObject({
      status: 'EFFECTIVE',
      phase: 'IN_GRACE',
      grace: { endsOn: grace().endsOn, reminderOn: grace().reminderOn },
      closure: null,
    });
    expect(detail.oldRights).toEqual([
      expect.objectContaining({
        assignmentId,
        state: 'HELD',
        revocation: null,
        regranted: false,
        provisioningType: 'K2',
      }),
    ]);
    expect(detail.commitmentsReleased).toHaveLength(1);
    expect(BigInt(detail.commitmentsReleased[0].amountMinor)).toBeGreaterThan(0n);
    expect(detail.snapshot?.before?.rights.map((right) => right.assignmentId)).toEqual([assignmentId]);
    expect(detail.snapshot?.after).toBeNull();
  }, 240_000);

  it('P7: the old right says it is being taken away, with the task, once the system opens the revocation of the grace', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-RG-DEST2');
    const { assignmentId } = await seatAndCommitment(u);
    const wire = await h.moveToday(u.member, dest.department);
    const system: SystemActor = { kind: 'SYSTEM', correlationId: `transfer-grace:${wire.id}` };
    const opened = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingApi).openRevocation(tx, system, {
        assignmentId,
        source: 'TRANSFER',
        decision: { decidedRole: 'SYSTEM', referenceKind: 'DEPARTMENT_TRANSFER', referenceId: wire.id },
      }),
    );

    const detail = await detailOf(wire.id);

    expect(detail.oldRights.map((right) => ({ assignmentId: right.assignmentId, state: right.state }))).toEqual([
      { assignmentId, state: 'REVOKING' },
    ]);
    expect(detail.oldRights[0].revocation?.taskId).toBe(opened.taskId);
  }, 240_000);

  it('P7: the phase is revoking the day after the last day of the grace, and the list says it with the grace of each row', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-RG-DEST3');
    const wire = await h.moveToday(u.member, dest.department);
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `UPDATE department_transfers SET effective_on = $3, grace_ends_on = $2, grace_reminder_on = $2 WHERE id = $1`,
        [wire.id, addDays(h.today(), -1), addDays(h.today(), -10)],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }

    expect((await detailOf(wire.id)).phase).toBe('REVOKING');
    const listed = h.dataOf<{ items: { id: string; phase: string; grace: { endsOn: string } | null }[] }>(
      await h.listTransfers(`?employeeId=${u.member.employeeId}`).expect(200),
    );
    expect(listed.items.map((item) => ({ id: item.id, phase: item.phase, endsOn: item.grace?.endsOn }))).toEqual([
      { id: wire.id, phase: 'REVOKING', endsOn: addDays(h.today(), -1) },
    ]);
  }, 240_000);

  it('P7: filters the list by the day the grace ends before, and pages it', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-RG-DEST4');
    const wire = await h.moveToday(u.member, dest.department);
    const ends = grace().endsOn;
    const idsOf = async (query: string): Promise<string[]> =>
      h
        .dataOf<{ items: { id: string }[]; pagination: { page: number; pageSize: number; totalItems: number } }>(
          await h.listTransfers(`?employeeId=${u.member.employeeId}${query}`).expect(200),
        )
        .items.map((item) => item.id);

    expect(await idsOf(`&graceEndsBefore=${ends}`)).toEqual([]);
    expect(await idsOf(`&graceEndsBefore=${addDays(ends, 1)}`)).toEqual([wire.id]);
    const paged = h.dataOf<{ pagination: { page: number; pageSize: number; totalItems: number } }>(
      await h.listTransfers(`?employeeId=${u.member.employeeId}&page=1&pageSize=1`).expect(200),
    );
    expect(paged.pagination).toMatchObject({ page: 1, pageSize: 1, totalItems: 1 });
    await h.listTransfers('?graceEndsBefore=soon').expect(422);
  }, 240_000);

  it('P7: an IT Admin reads the old rights but not the money, the picture, the basis; a transfer from before the grace has its old rights read from the seats held now', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-RG-DEST5');
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const { assignmentId } = await seatAndCommitment(u);
    const wire = await h.moveToday(u.member, dest.department);

    const minimal = await detailOf(wire.id, h.it1);

    expect(minimal.groundsNote).toBeNull();
    expect(minimal.commitmentsReleased).toEqual([]);
    expect(minimal.snapshot).toBeNull();
    expect(minimal.oldRights.map((right) => right.assignmentId)).toEqual([assignmentId]);
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(`UPDATE department_transfers SET snapshot_before = NULL WHERE id = $1`, [wire.id]);
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
    const legacy = await detailOf(wire.id);
    expect(legacy.snapshot).toBeNull();
    expect(legacy.oldRights.map((right) => right.assignmentId)).toEqual([assignmentId]);
  }, 240_000);

  it('P7: a transfer that waits has no grace, no old right and no money released', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-RG-DEST6');
    const waiting = await h.recorded({
      employeeId: u.member.employeeId,
      toDepartmentId: dest.department.id,
      effectiveOn: h.day(30),
      groundsNote: h.groundsNote,
    });

    expect(await detailOf(waiting.id)).toMatchObject({
      phase: 'PENDING',
      grace: null,
      oldRights: [],
      commitmentsReleased: [],
      snapshot: null,
    });
  }, 240_000);

  it('P8: the person reads their own transfer while the grace lasts: the departments, the last day and the rights that are still theirs; nobody reads anybody else', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-RG-DEST7');
    const { assignmentId } = await seatAndCommitment(u);
    const wire = await h.moveToday(u.member, dest.department);

    const own = await mine(u.member.account);

    expect(own).toMatchObject({
      id: wire.id,
      from: { department: { id: u.department.id } },
      to: { department: { id: dest.department.id } },
      effectiveOn: h.today(),
      grace: { endsOn: grace().endsOn, reminderOn: grace().reminderOn },
      rights: [expect.objectContaining({ assignmentId, state: 'HELD' })],
    });
    expect(await mine(u.head.account)).toBeNull();
    expect(await mine(dest.head.account)).toBeNull();
  }, 240_000);

  it('P8: no data when the person has no transfer, when it waits, and after the last day of the grace', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-RG-DEST8');
    expect(await mine(u.member.account)).toBeNull();
    const wire = await h.moveToday(u.member, dest.department);
    expect(await mine(u.member.account)).not.toBeNull();

    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `UPDATE department_transfers SET effective_on = $3, grace_ends_on = $2, grace_reminder_on = $2 WHERE id = $1`,
        [wire.id, addDays(h.today(), -1), addDays(h.today(), -10)],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }

    expect(await mine(u.member.account)).toBeNull();
  }, 240_000);

  it('R-21: stepping down from a role is not a transfer: no transfer is made, no grace opens, nobody is told, and the seat stays', async () => {
    const u = await unit();
    const { assignmentId } = await seatAndCommitment(u);
    await changeRoleTo(h.ctx, h.admin, u.member.employeeId, 'MANAGER');
    const before = await h.ctx.sql.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM department_transfers) || '/' ||
              (SELECT count(*) FROM in_app_notifications WHERE code = 'TRANSFER_GRACE_STARTED') AS n`,
    );

    await changeRoleTo(h.ctx, h.admin, u.member.employeeId, 'EMPLOYEE');

    const after = await h.ctx.sql.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM department_transfers) || '/' ||
              (SELECT count(*) FROM in_app_notifications WHERE code = 'TRANSFER_GRACE_STARTED') AS n`,
    );
    expect(after.rows).toEqual(before.rows);
    expect(await mine(u.member.account)).toBeNull();
    const seat = await h.ctx.sql.query<{ valid_until: string | null }>(
      'SELECT valid_until FROM license_assignments WHERE id = $1',
      [assignmentId],
    );
    expect(seat.rows[0].valid_until).toBeNull();
  }, 240_000);
});
