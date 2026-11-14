import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { SystemActor } from '../../../src/modules/licensing/public/licensing.types';
import { graceOf } from '../../../src/modules/personnel/transfer-grace/transfer-grace.policy';
import { TransferGraceService } from '../../../src/modules/personnel/transfer-grace/transfer-grace.service';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;
const MONTHLY = BigInt(M);
const NONE: ReadonlySet<string> = new Set();

/** What the days of the month of `day` before it cost at `monthly` a month, rounded half up: worked out here, apart from the code. */
const usedBefore = (monthly: bigint, day: string): bigint => {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const days = BigInt(new Date(Date.UTC(year, month, 0)).getUTCDate());

  return (2n * monthly * BigInt(dayOfMonth - 1) + days) / (2n * days);
};
const monthOf = (day: string): number => Number(day.slice(5, 7));

/**
 * `MF3-B.4` (`QĐ-110o`, `QĐ-110p`, `QĐ-111bg`, SPEC T-MF3): the day a transfer takes effect, the system closes the paid requests of the old
 * department, gives back the money held for the old rights once, opens the grace (the last day, the day of the reminder, the picture of the
 * rights before), says so in the Audit Trail and tells the person, the heads and the IT Admin. Nothing is revoked. On real PostgreSQL,
 * through the routes that record the transfer.
 */
describe('the day a transfer takes effect (integration, real PostgreSQL)', () => {
  const plans: { plan: string; subscriptionId: string }[] = [];
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    for (let i = 0; i < 3; i += 1) {
      const subscriptionId = await h.subscription(40, 'K2');
      plans.push({ plan: await h.planOf(subscriptionId), subscriptionId });
    }
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-EG${counter}`);
    await h.budgetFor(u, { total: 500 * M });
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = '2026-01-05' WHERE employee_id = $1`, [
      u.member.employeeId,
    ]);

    return u;
  };
  const setSeatMonthly = (requestId: string, minor: bigint | null) =>
    h.ctx.sql.query(`UPDATE budget_commitments SET seat_monthly_minor = $2 WHERE request_id = $1`, [
      requestId,
      minor === null ? null : minor.toString(),
    ]);
  /** A request for the member approved for the whole year at 1 000 000 a month, with no end. */
  const approved = async (u: Unit, which: number): Promise<string> => {
    const id = await h.waitingForApprover(u, plans[which].plan, { amount: 12 * M });
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_months = 12, price_kind = 'RECURRING', expected_end_date = NULL, budget_year = $2 WHERE id = $1`,
      [id, h.year],
    );
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };
  const taskOf = async (requestId: string, which: number): Promise<string> =>
    h.dataOf<{ task: { id: string } }>(
      await h.grant({ requestId, subscriptionId: plans[which].subscriptionId }).expect(201),
    ).task.id;
  /** The grant of the request completed through the routes: the seat the member holds, with the price a month kept on its commitment. */
  const seatGranted = async (requestId: string, which: number): Promise<string> => {
    await setSeatMonthly(requestId, null);
    const task = await taskOf(requestId, which);
    await h.claim(task).expect(200);
    await h.complete(task, { evidence: 'Added to the workspace' }).expect(200);
    await setSeatMonthly(requestId, MONTHLY);

    return (
      await h.ctx.sql.query<{ assignment_id: string }>('SELECT assignment_id FROM provisioning_tasks WHERE id = $1', [
        task,
      ])
    ).rows[0].assignment_id;
  };
  const transferRow = async (id: string) =>
    (
      await h.ctx.sql.query<{
        grace_ends_on: string | null;
        grace_reminder_on: string | null;
        snapshot_before: {
          takenOn: string;
          rights: { assignmentId: string; provisioningType: string }[];
          commitmentsReleased: { currency: string; amountMinor: string }[];
          requestsCancelled: number;
          requestsToCheck: number;
        } | null;
      }>(
        `SELECT to_char(grace_ends_on, 'YYYY-MM-DD') AS grace_ends_on, to_char(grace_reminder_on, 'YYYY-MM-DD') AS grace_reminder_on,
                snapshot_before FROM department_transfers WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const stateOf = async (requestId: string): Promise<string> =>
    (await h.ctx.sql.query<{ state: string }>('SELECT state::text FROM access_requests WHERE id = $1', [requestId]))
      .rows[0].state;
  const ledger = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ reason: string; amount_minor: string; reason_text: string | null }>(
        `SELECT r.reason::text, r.amount_minor::text, r.reason_text FROM budget_commitment_releases r
           JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1 ORDER BY r.released_at, r.id`,
        [requestId],
      )
    ).rows;
  const noticesOf = async (transferId: string) =>
    (
      await h.ctx.sql.query<{ recipient: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id AS recipient, params FROM in_app_notifications
          WHERE code = 'TRANSFER_GRACE_STARTED' AND subject_id = $1 ORDER BY recipient_employee_id`,
        [transferId],
      )
    ).rows;
  /** The grace of the rule over a calendar with no day off, as the person is told it: day 1 is today. */
  const grace = () =>
    graceOf({
      effectiveOn: h.today(),
      notedOn: h.today(),
      workingDays: 5,
      reminderWorkingDays: 2,
      nonWorkingDates: NONE,
    });
  const graceEnds = (): string => grace().endsOn;

  it('T-MF3: closes the open paid request of the old department, gives back the commitment of the old right once, opens the grace and revokes nothing', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-EG-DEST');
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const r1 = await approved(u, 0);
    const seat = await seatGranted(r1, 0);
    const waiting = await h.waitingForApprover(u, plans[1].plan, { amount: 12 * M });
    const running = await approved(u, 2);
    await h.claim(await taskOf(running, 2)).expect(200);

    const wire = await h.moveToday(u.member, dest.department);

    // The grace begins the day of the transfer (day 1) and ends on the fifth working day; the reminder is two working days before.
    const stored = await transferRow(wire.id);
    expect(stored.grace_ends_on).toBe(graceEnds());
    expect(stored.grace_reminder_on).toBe(grace().reminderOn);
    // The paid request that waited is closed; the one whose grant is being carried out is left to the IT Admin.
    expect(await stateOf(waiting)).toBe('CANCELLED');
    expect(await stateOf(running)).not.toBe('CANCELLED');
    // The money held for the old right goes back from the day of the transfer, once: the months from that day less the days used.
    const expected = MONTHLY * BigInt(12 - monthOf(h.today()) + 1) - usedBefore(MONTHLY, h.today());
    expect((await ledger(r1)).filter((row) => row.reason === 'TRANSFER_EFFECTIVE')).toEqual([
      {
        reason: 'TRANSFER_EFFECTIVE',
        amount_minor: expected.toString(),
        reason_text: `transfer:${wire.id}:assignment:${seat}`,
      },
    ]);
    // The picture of the rights before.
    expect(stored.snapshot_before).toMatchObject({
      takenOn: h.today(),
      requestsCancelled: 1,
      requestsToCheck: 1,
    });
    // The seat held and the seat of the grant being carried out are both the person's to lose when the grace ends; only the first gave money back.
    expect(stored.snapshot_before?.rights).toHaveLength(2);
    expect(stored.snapshot_before?.rights.map((right) => right.assignmentId)).toContain(seat);
    expect(stored.snapshot_before?.commitmentsReleased).toHaveLength(1);
    expect(stored.snapshot_before?.commitmentsReleased[0].amountMinor).toBe(expected.toString());
    // Nothing is revoked: the seat is held, with no task to take it away.
    const seatRow = await h.ctx.sql.query<{ valid_until: string | null }>(
      'SELECT valid_until FROM license_assignments WHERE id = $1',
      [seat],
    );
    expect(seatRow.rows[0].valid_until).toBeNull();
    const revokes = await h.ctx.sql.query(
      `SELECT 1 FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE'`,
      [seat],
    );
    expect(revokes.rowCount).toBe(0);
  }, 240_000);

  it('says it in the Audit Trail as the system, and tells the person with the last day of the grace, each head, and the IT Admin of the old department, once each', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-EG-DEST2');
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });

    const wire = await h.moveToday(u.member, dest.department);

    const events = await h.auditEventsOf('DEPARTMENT_TRANSFER.GRACE_OPENED', wire.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_kind: 'SYSTEM', actor_app_user_id: null });
    expect(events[0].after).toMatchObject({ graceEndsOn: graceEnds(), rights: 0 });
    expect((await h.auditEventsOf('DEPARTMENT_TRANSFER.EFFECTIVE', wire.id)).length).toBeGreaterThanOrEqual(1);
    const notices = await noticesOf(wire.id);
    const audienceOf = (employeeId: string) => notices.find((item) => item.recipient === employeeId)?.params.audience;
    expect(audienceOf(u.member.employeeId)).toBe('MOVER');
    expect(audienceOf(u.head.employeeId)).toBe('HEAD');
    expect(audienceOf(dest.head.employeeId)).toBe('HEAD');
    expect(audienceOf(h.it1.employeeId)).toBe('IT_ADMIN');
    expect(new Set(notices.map((item) => item.recipient)).size).toBe(notices.length);
    for (const item of notices)
      expect(item.params).toMatchObject({
        transferId: wire.id,
        employeeId: u.member.employeeId,
        fromDepartmentId: u.department.id,
        toDepartmentId: dest.department.id,
        graceEndsOn: graceEnds(),
      });
  }, 240_000);

  it('opens the grace of a person who holds nothing: an empty picture, no release, no request closed', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-EG-DEST3');

    const wire = await h.moveToday(u.member, dest.department);

    expect((await transferRow(wire.id)).snapshot_before).toEqual({
      takenOn: h.today(),
      rights: [],
      commitmentsReleased: [],
      requestsCancelled: 0,
      requestsToCheck: 0,
    });
  }, 240_000);

  it('is idempotent: the second time the day is seen nothing is released, closed or told again', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-EG-DEST4');
    const r1 = await approved(u, 0);
    await seatGranted(r1, 0);
    const wire = await h.moveToday(u.member, dest.department);
    const before = { ledger: await ledger(r1), notices: await noticesOf(wire.id), row: await transferRow(wire.id) };

    const again = await h.ctx.app.get(TransactionRunner, { strict: false }).run((tx) =>
      h.ctx.app.get(TransferGraceService, { strict: false }).open(tx, {
        id: wire.id,
        organizationId: h.seed.organizationId,
        employeeId: u.member.employeeId,
        fromDepartmentId: u.department.id,
        toDepartmentId: dest.department.id,
        effectiveOn: h.today(),
      }),
    );

    expect(again).toBeNull();
    expect({ ledger: await ledger(r1), notices: await noticesOf(wire.id), row: await transferRow(wire.id) }).toEqual(
      before,
    );
    expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.GRACE_OPENED', wire.id)).toHaveLength(1);
  }, 240_000);

  it('BLK-3 end to end: the revocation the grace ends in (source TRANSFER) gives nothing back again, so the whole release is the part from the day of the transfer', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead('P-EG-DEST5');
    const r1 = await approved(u, 0);
    const seat = await seatGranted(r1, 0);
    const wire = await h.moveToday(u.member, dest.department);
    const system: SystemActor = { kind: 'SYSTEM', correlationId: `transfer-grace:${wire.id}` };
    const opened = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingApi).openRevocation(tx, system, {
        assignmentId: seat,
        source: 'TRANSFER',
        decision: { decidedRole: 'SYSTEM', referenceKind: 'DEPARTMENT_TRANSFER', referenceId: wire.id },
      }),
    );
    await h.claim(opened.taskId).expect(200);

    await request(h.server())
      .post(`/api/v1/provisioning-tasks/${opened.taskId}/revocation-completion`)
      .set(h.as(h.it1))
      .send({ completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
      .expect(200);

    const rows = await ledger(r1);
    expect(rows.map((row) => row.reason)).toEqual(['TRANSFER_EFFECTIVE']);
    const released = (
      await h.ctx.sql.query<{ released_minor: string }>(
        'SELECT released_minor::text FROM budget_commitments WHERE request_id = $1',
        [r1],
      )
    ).rows[0].released_minor;
    expect(released).toBe((MONTHLY * BigInt(12 - monthOf(h.today()) + 1) - usedBefore(MONTHLY, h.today())).toString());
  }, 240_000);
});
