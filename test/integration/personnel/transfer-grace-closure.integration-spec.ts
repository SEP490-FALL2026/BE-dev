import { addDays } from '../../../src/core/business-date';
import { graceOf } from '../../../src/modules/personnel/transfer-grace/transfer-grace.policy';
import { TransferRevocationService } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.service';
import type { ApiAccount } from '../../support/api-accounts';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const NONE: ReadonlySet<string> = new Set();

interface DetailWire {
  phase: string;
  closure: {
    closedAt: string;
    closedByAppUserId: string | null;
    closedBySystem: boolean;
    supersededByCaseId: string | null;
  } | null;
  snapshot: { after: { takenOn: string; rights: { assignmentId: string; outcome: string }[] } | null } | null;
}

interface ClosedRow {
  closed: boolean;
  closed_by_system: boolean;
  closed_by_app_user_id: string | null;
  superseded_by_case_id: string | null;
  snapshot_after: { takenOn: string; rights: { assignmentId: string; outcome: string }[] } | null;
}

/**
 * `MF3-C.2` (`QĐ-110r`, SPEC MF3-C.2): the system closes the transfer with no account and a picture of what became of each right — when the last task
 * of revocation is completed, and also when the grace is over and nothing is left to take back (the person held nothing, or the transfer is from
 * before the grace) — and a departure recorded in the grace takes the old rights over and closes it as superseded. A person whose transfer is
 * closed can be moved again. On real PostgreSQL.
 */
describe('the system closes the transfer of a person who moved (integration, real PostgreSQL)', () => {
  let k2a: string;
  let k2b: string;
  let it2: ApiAccount;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    k2a = await h.subscription(40, 'K2');
    k2b = await h.subscription(40, 'K2');
    it2 = await handOthersToSecondItAdmin(h);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A pass looks at every transfer: the reminders the tests before left owed are marked as done, so each test sees only its own. */
  beforeEach(async () => {
    await h.ctx.sql.query(
      `UPDATE department_transfers SET reminded_at = now()
        WHERE status = 'EFFECTIVE' AND closed_at IS NULL AND grace_ends_on IS NOT NULL AND reminded_at IS NULL`,
    );
  });

  const revocation = () => h.ctx.app.get(TransferRevocationService, { strict: false });
  const at = (day: string) => new Date(`${day}T12:00:00Z`);
  const grace = () =>
    graceOf({
      effectiveOn: h.today(),
      notedOn: h.today(),
      workingDays: 5,
      reminderWorkingDays: 2,
      nonWorkingDates: NONE,
    });
  const afterGrace = (): string => addDays(grace().endsOn, 1);

  const example = async (): Promise<{ u: Unit; dest: Unit; person: Person; code: string }> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-GC${counter}`);
    const dest = await h.departmentWithHead(`P-GC${counter}-DEST`);
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.setItAdminInCharge(dest.department, { employeeId: it2.employeeId, account: it2 });
    const code = `GC-E${counter}`;

    return { u, dest, person: await h.worker(u.department, code), code };
  };
  /** The grace of the transfer is over by the real clock too (the route that completes a task reads the real day). */
  const graceOverNow = async (transferId: string): Promise<void> => {
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `UPDATE department_transfers SET effective_on = $2, grace_ends_on = $3, grace_reminder_on = $4 WHERE id = $1`,
        [transferId, addDays(h.today(), -10), addDays(h.today(), -1), addDays(h.today(), -3)],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
  };
  const rowOf = async (id: string): Promise<ClosedRow> =>
    (
      await h.ctx.sql.query<ClosedRow>(
        `SELECT closed_at IS NOT NULL AS closed, closed_by_system, closed_by_app_user_id, superseded_by_case_id, snapshot_after
           FROM department_transfers WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const detailOf = async (id: string): Promise<DetailWire> =>
    h.dataOf<DetailWire>(await h.readTransfer(id).expect(200));
  const taskOf = async (assignmentId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM provisioning_tasks WHERE kind = 'REVOKE' AND assignment_id = $1 AND status NOT IN ('CLOSED_FAILED', 'CANCELLED')`,
        [assignmentId],
      )
    ).rows[0].id;
  const complete = async (assignmentId: string): Promise<void> => {
    const task = await taskOf(assignmentId);
    await h.claim(task, it2).expect(200);
    await h.revoked(task, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }, it2).expect(200);
  };
  const another = async (): Promise<Unit> => h.departmentWithHead(`P-GC-NEXT${(counter += 1)}`);

  it('closes when the last task of revocation is completed, not before: no account, the picture of what became of each right, the phase and the audit event', async () => {
    const { dest, person, code } = await example();
    const first = await h.seatOf(person, { subscriptionId: k2a }, code);
    const second = await h.seatOf(person, { subscriptionId: k2b }, code);
    const wire = await h.moveToday(person, dest.department);
    await graceOverNow(wire.id);
    await revocation().sweep();
    expect((await detailOf(wire.id)).phase).toBe('REVOKING');

    await complete(first);

    expect((await rowOf(wire.id)).closed).toBe(false);
    expect((await detailOf(wire.id)).phase).toBe('REVOKING');
    await complete(second);

    const closed = await rowOf(wire.id);
    expect(closed).toMatchObject({
      closed: true,
      closed_by_system: true,
      closed_by_app_user_id: null,
      superseded_by_case_id: null,
    });
    expect(closed.snapshot_after?.takenOn).toBe(h.today());
    expect(
      [...(closed.snapshot_after?.rights ?? [])].sort((a, b) => a.assignmentId.localeCompare(b.assignmentId)),
    ).toEqual(
      [
        { assignmentId: first, outcome: 'REVOKED' },
        { assignmentId: second, outcome: 'REVOKED' },
      ].sort((a, b) => a.assignmentId.localeCompare(b.assignmentId)),
    );
    const detail = await detailOf(wire.id);
    expect(detail.phase).toBe('CLOSED');
    expect(detail.closure).toMatchObject({ closedByAppUserId: null, closedBySystem: true, supersededByCaseId: null });
    expect(detail.snapshot?.after?.rights).toHaveLength(2);
    const events = await h.auditEventsOf('DEPARTMENT_TRANSFER.CLOSED', wire.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_kind: 'SYSTEM', actor_app_user_id: null });
    expect(events[0].after).toMatchObject({ closedBySystem: true, rights: 2, revoked: 2 });
  }, 240_000);

  it('closes at once a transfer whose person held nothing, the day after the last day, with an empty picture, and the person can be moved again', async () => {
    const { dest, person } = await example();
    const next = await another();
    const wire = await h.moveToday(person, dest.department);
    const later = () =>
      h.recordTransfer({
        employeeId: person.employeeId,
        toDepartmentId: next.department.id,
        effectiveOn: h.day(30),
        groundsNote: h.groundsNote,
      });
    // The transfer is not closed: a new one is refused (409 TRANSFER_SETTLING).
    const refused = await later();
    expect([refused.status, h.codeOf(refused), h.detailsOf(refused)]).toEqual([
      409,
      'DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS',
      { kind: 'TRANSFER_SETTLING', effectiveOn: h.today() },
    ]);
    // The last day is still the grace: nothing is closed yet.
    const pass = await revocation().sweep(at(grace().endsOn));
    expect(pass.closed).toBe(0);
    expect((await rowOf(wire.id)).closed).toBe(false);

    const closing = await revocation().sweep(at(afterGrace()));

    expect(closing).toMatchObject({ closed: 1, rights: 0, failed: 0 });
    expect(await rowOf(wire.id)).toMatchObject({
      closed: true,
      closed_by_system: true,
      closed_by_app_user_id: null,
      snapshot_after: { takenOn: afterGrace(), rights: [] },
    });
    expect((await later()).status).toBe(201);
    // Closed once: the pass again closes nothing and writes no second audit event.
    expect((await revocation().sweep(at(afterGrace()))).closed).toBe(0);
    expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.CLOSED', wire.id)).toHaveLength(1);
  }, 240_000);

  it('m-17: closes a transfer from before the grace that held nothing, with no picture before and an empty one after', async () => {
    const { dest, person } = await example();
    const wire = await h.moveToday(person, dest.department);
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query('UPDATE department_transfers SET snapshot_before = NULL WHERE id = $1', [wire.id]);
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }

    await revocation().sweep(at(afterGrace()));

    expect(await rowOf(wire.id)).toMatchObject({
      closed: true,
      closed_by_system: true,
      snapshot_after: { rights: [] },
    });
  }, 240_000);

  it('keeps the transfer open while a right is left to take back, and closes it with no task to complete when the rights ended another way', async () => {
    const { dest, person, code } = await example();
    const kept = await h.seatOf(person, { subscriptionId: k2a }, code);
    const returned = await h.seatOf(person, { subscriptionId: k2b }, code);
    const wire = await h.moveToday(person, dest.department);
    // One right is returned by the person in the grace: a task of another source takes it away and is completed.
    const task = await h.open(returned, 'RETURN', { decision: { decidedRole: 'EMPLOYEE' } });
    await h.claim(task.taskId).expect(200);
    await h.revoked(task.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);

    await revocation().sweep(at(afterGrace()));
    await graceOverNow(wire.id);

    // The other right has a task of the transfer waiting: the transfer stays open.
    expect((await rowOf(wire.id)).closed).toBe(false);
    expect((await detailOf(wire.id)).phase).toBe('REVOKING');
    await complete(kept);
    const closed = await rowOf(wire.id);
    expect(closed.closed).toBe(true);
    expect(closed.snapshot_after?.rights.find((right) => right.assignmentId === kept)?.outcome).toBe('REVOKED');
    expect(closed.snapshot_after?.rights.find((right) => right.assignmentId === returned)?.outcome).toBe('ENDED');
  }, 240_000);

  it('QĐ-110r: a departure recorded in the grace closes the transfer as superseded by that case, takes nothing back itself, and the sweep opens no revocation for it', async () => {
    const { dest, person, code } = await example();
    const seat = await h.seatOf(person, { subscriptionId: k2a }, code);
    const wire = await h.moveToday(person, dest.department);

    const departure = await h.recordedCase(person);

    expect(await rowOf(wire.id)).toMatchObject({
      closed: true,
      closed_by_system: true,
      closed_by_app_user_id: null,
      superseded_by_case_id: departure.id,
      snapshot_after: { rights: [{ assignmentId: seat, outcome: 'TAKEN_OVER' }] },
    });
    const detail = await detailOf(wire.id);
    expect(detail.phase).toBe('SUPERSEDED');
    expect(detail.closure).toMatchObject({ closedBySystem: true, supersededByCaseId: departure.id });
    const events = await h.auditEventsOf('DEPARTMENT_TRANSFER.SUPERSEDED', wire.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_kind: 'SYSTEM' });
    expect(events[0].after).toMatchObject({ supersededByCaseId: departure.id, takenOver: 1 });
    // The sweep leaves the old rights to the departure: no task of the source TRANSFER, the seat is still held.
    await revocation().sweep(at(afterGrace()));
    const tasks = await h.ctx.sql.query(
      `SELECT 1 FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE'`,
      [seat],
    );
    expect(tasks.rowCount).toBe(0);
    expect((await h.assignmentRow(seat)).valid_until).toBeNull();
  }, 240_000);

  it('a departure recorded once the grace is over does not supersede: the revocation is open and the transfer stays in force', async () => {
    const { dest, person, code } = await example();
    const seat = await h.seatOf(person, { subscriptionId: k2a }, code);
    const wire = await h.moveToday(person, dest.department);
    await graceOverNow(wire.id);
    await revocation().sweep();

    await h.recordedCase(person);

    expect(await rowOf(wire.id)).toMatchObject({ closed: false, superseded_by_case_id: null });
    expect(await taskOf(seat)).toBeTruthy();
  }, 240_000);

  it('a departure of a person with no transfer, or whose transfer waits, supersedes nothing', async () => {
    const plain = await example();
    const waiting = await example();
    const pending = await h.recorded({
      employeeId: waiting.person.employeeId,
      toDepartmentId: waiting.dest.department.id,
      effectiveOn: h.day(30),
      groundsNote: h.groundsNote,
    });

    await h.recordedCase(plain.person);
    await h.recordedCase(waiting.person, { cancelPendingTransfer: true });

    // The transfer that waited is cancelled with the departure, not superseded by it.
    expect(h.dataOf<{ status: string }>(await h.readTransfer(pending.id).expect(200)).status).toBe('CANCELLED');
    expect((await rowOf(pending.id)).superseded_by_case_id).toBeNull();
    const count = await h.ctx.sql.query(
      `SELECT 1 FROM audit_events WHERE action = 'DEPARTMENT_TRANSFER.SUPERSEDED' AND resource_id = $1`,
      [pending.id],
    );
    expect(count.rowCount).toBe(0);
  }, 240_000);
});
