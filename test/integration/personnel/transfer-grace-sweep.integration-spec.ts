import { addDays } from '../../../src/core/business-date';
import { graceOf } from '../../../src/modules/personnel/transfer-grace/transfer-grace.policy';
import { TransferRevocationService } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.service';
import { TransferTellingService } from '../../../src/modules/personnel/transfer-grace/transfer-telling.service';
import { OffboardingHarness } from '../../support/offboarding-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { ApiAccount } from '../../support/api-accounts';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const NONE: ReadonlySet<string> = new Set();

interface TaskRow {
  id: string;
  assignment_id: string;
  status: string;
  revocation_source: string | null;
  created_by_system: boolean;
  default_responsible_employee_id: string | null;
}

/**
 * `MF3-C.1` (`QĐ-110p`, SPEC T-MF3): the sweep of the grace of a transfer. The day after the last day it opens the revocation of every personal
 * right the person held from before the transfer that is still in force, as the system, with the transfer as the reference, in the queue of the
 * IT Admin in charge of the new department; asking again changes nothing and a seat that has a live task of another source gets the reason
 * besides. Before it, the person is told once more on the day of the reminder, and a transfer from before the grace existed (m-17) is told on its
 * start. The passes run by hand at the instant a test names. On real PostgreSQL.
 */
describe('the end of the grace of a transfer (integration, real PostgreSQL)', () => {
  let k1: string;
  let k2: string;
  let k2b: string;
  let internal: string;
  /** The IT Admin in charge of the department a person moves to. */
  let it2: ApiAccount;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    k1 = await h.subscription(40, 'K1');
    k2 = await h.subscription(40, 'K2');
    k2b = await h.subscription(40, 'K2');
    internal = await h.plan('K5');
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
  const telling = () => h.ctx.app.get(TransferTellingService, { strict: false });
  const at = (day: string) => new Date(`${day}T12:00:00Z`);
  /** The grace of a transfer that takes effect today, over a calendar with no day off: day 1 is today, the fifth working day is the last. */
  const grace = () =>
    graceOf({
      effectiveOn: h.today(),
      notedOn: h.today(),
      workingDays: 5,
      reminderWorkingDays: 2,
      nonWorkingDates: NONE,
    });
  const afterGrace = (): string => addDays(grace().endsOn, 1);

  /** A department with a head and the IT Admin in charge of the department the person moves to, and a person of the first who holds nothing yet. */
  const example = async (): Promise<{ u: Unit; dest: Unit; person: Person; code: string }> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-GS${counter}`);
    const dest = await h.departmentWithHead(`P-GS${counter}-DEST`);
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.setItAdminInCharge(dest.department, { employeeId: it2.employeeId, account: it2 });
    const code = `GS-E${counter}`;

    return { u, dest, person: await h.worker(u.department, code), code };
  };
  const tasksOf = async (assignmentIds: string[]): Promise<TaskRow[]> =>
    (
      await h.ctx.sql.query<TaskRow>(
        `SELECT id, assignment_id, status::text, revocation_source::text, created_by_system, default_responsible_employee_id
           FROM provisioning_tasks WHERE kind = 'REVOKE' AND assignment_id = ANY($1::uuid[]) ORDER BY assignment_id, created_at`,
        [assignmentIds],
      )
    ).rows;
  const reasonsOf = async (taskId: string) =>
    (
      await h.ctx.sql.query<{
        source: string;
        decided_role: string;
        reference_kind: string | null;
        reference_id: string | null;
      }>(
        `SELECT source::text, decided_role, reference_kind, reference_id FROM provisioning_task_reasons WHERE task_id = $1 ORDER BY created_at, id`,
        [taskId],
      )
    ).rows;
  const noticesOf = async (code: string, transferId: string) =>
    (
      await h.ctx.sql.query<{ recipient: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id AS recipient, params FROM in_app_notifications
          WHERE code = $1 AND subject_id = $2 ORDER BY recipient_employee_id`,
        [code, transferId],
      )
    ).rows;
  const transferRow = async (id: string) =>
    (
      await h.ctx.sql.query<{
        reminded: boolean;
        snapshot_before: { takenOn: string; rights: { assignmentId: string }[] } | null;
      }>(`SELECT reminded_at IS NOT NULL AS reminded, snapshot_before FROM department_transfers WHERE id = $1`, [id])
    ).rows[0];
  /** Makes a transfer look like one that took effect before the grace existed (m-17): no picture of the rights, nobody told. */
  const asLegacy = async (transferId: string): Promise<void> => {
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query('ALTER TABLE in_app_notifications DISABLE TRIGGER USER');
      await h.ctx.sql.query('UPDATE department_transfers SET snapshot_before = NULL WHERE id = $1', [transferId]);
      await h.ctx.sql.query(
        `DELETE FROM in_app_notifications WHERE code = 'TRANSFER_GRACE_STARTED' AND subject_id = $1`,
        [transferId],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('ALTER TABLE in_app_notifications ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
  };

  it('T-MF3: opens exactly one revocation for each of the three rights (K1, K2, K5) the day after the last day, as the system, for the IT Admin of the new department, and not before', async () => {
    const { dest, person, code } = await example();
    const seats = [
      await h.seatOf(person, { subscriptionId: k1 }, code),
      await h.seatOf(person, { subscriptionId: k2 }, code),
      await h.seatOf(person, { planId: internal }, code),
    ];
    const wire = await h.moveToday(person, dest.department);

    // The last day is still the grace: the system does nothing yet.
    expect((await revocation().sweep(at(grace().endsOn))).rights).toBe(0);
    expect(await tasksOf(seats)).toEqual([]);

    const pass = await revocation().sweep(at(afterGrace()));

    expect(pass).toMatchObject({ transfers: 1, rights: 3, failed: 0 });
    const tasks = await tasksOf(seats);
    expect(tasks.map((task) => task.assignment_id).sort()).toEqual([...seats].sort());
    for (const task of tasks) {
      expect(task).toMatchObject({
        status: 'QUEUED',
        revocation_source: 'TRANSFER',
        created_by_system: true,
        default_responsible_employee_id: it2.employeeId,
      });
      expect(await reasonsOf(task.id)).toEqual([
        {
          source: 'TRANSFER',
          decided_role: 'TRANSFER_PROCESS',
          reference_kind: 'DEPARTMENT_TRANSFER',
          reference_id: wire.id,
        },
      ]);
    }
    const events = await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', wire.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_kind: 'SYSTEM', actor_app_user_id: null });
    expect(events[0].after).toMatchObject({ tasksCreated: 3, reasonsAdded: 0 });
    const notices = await noticesOf('TRANSFER_RIGHTS_REVOKING', wire.id);
    expect(notices.map((notice) => notice.recipient).sort()).toEqual([person.employeeId, it2.employeeId].sort());
    for (const notice of notices)
      expect(notice.params).toMatchObject({ toDepartmentId: dest.department.id, rightCount: 3 });
  }, 240_000);

  it('is idempotent: a second pass, and the pass of every later day, add no task, no reason, no notice, no audit event', async () => {
    const { dest, person, code } = await example();
    const seats = [
      await h.seatOf(person, { subscriptionId: k2 }, code),
      await h.seatOf(person, { planId: internal }, code),
    ];
    const wire = await h.moveToday(person, dest.department);
    await revocation().sweep(at(afterGrace()));
    const before = {
      tasks: await tasksOf(seats),
      notices: await noticesOf('TRANSFER_RIGHTS_REVOKING', wire.id),
      events: await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', wire.id),
    };

    const again = await revocation().sweep(at(afterGrace()));
    await revocation().sweep(at(addDays(afterGrace(), 3)));

    expect(again).toMatchObject({ transfers: 0, rights: 0, failed: 0 });
    expect({
      tasks: await tasksOf(seats),
      notices: await noticesOf('TRANSFER_RIGHTS_REVOKING', wire.id),
      events: await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', wire.id),
    }).toEqual(before);
    expect(before.tasks).toHaveLength(2);
  }, 240_000);

  it('a seat that has a live task of another source is given the reason of the transfer besides, never a second task', async () => {
    const { dest, person, code } = await example();
    const returned = await h.seatOf(person, { subscriptionId: k2 }, code);
    const other = await h.seatOf(person, { planId: internal }, code);
    const wire = await h.moveToday(person, dest.department);
    const live = await h.open(returned, 'RETURN', { decision: { decidedRole: 'EMPLOYEE' } });

    const pass = await revocation().sweep(at(afterGrace()));

    expect(pass.rights).toBe(2);
    const tasks = await tasksOf([returned, other]);
    expect(tasks).toHaveLength(2);
    expect(tasks.find((task) => task.assignment_id === returned)?.id).toBe(live.taskId);
    expect((await reasonsOf(live.taskId)).map((reason) => reason.source)).toEqual(['RETURN', 'TRANSFER']);
    expect((await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', wire.id))[0].after).toMatchObject({
      tasksCreated: 1,
      reasonsAdded: 1,
    });
  }, 240_000);

  it('takes back only a right that is still in force and is a right of the old department: an ended one and one granted after the picture of the day are left alone', async () => {
    const { dest, person, code } = await example();
    const ended = await h.seatOf(person, { subscriptionId: k2 }, code);
    const held = await h.seatOf(person, { planId: internal }, code);
    const task = await h.open(ended, 'RETURN', { decision: { decidedRole: 'EMPLOYEE' } });
    await h.claim(task.taskId).expect(200);
    await h.revoked(task.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);
    const wire = await h.moveToday(person, dest.department);
    // A right granted to a request of the new head after the picture of the day is the new department's, however far back its start is dated.
    const later = await h.seatOf(person, { subscriptionId: k2b }, code);

    const pass = await revocation().sweep(at(afterGrace()));

    expect(pass).toMatchObject({ transfers: 1, rights: 1 });
    expect((await tasksOf([held])).map((row) => row.revocation_source)).toEqual(['TRANSFER']);
    expect(await tasksOf([later])).toEqual([]);
    expect((await tasksOf([ended])).map((row) => row.revocation_source)).toEqual(['RETURN']);
    expect((await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', wire.id))[0].after).toMatchObject({
      tasksCreated: 1,
    });
  }, 240_000);

  it('opens nothing for a person who holds nothing, and nothing for a transfer that is cancelled or still waiting', async () => {
    const { dest, person } = await example();
    const wire = await h.moveToday(person, dest.department);
    const waiting = await example();
    const pending = await h.recorded({
      employeeId: waiting.person.employeeId,
      toDepartmentId: waiting.dest.department.id,
      effectiveOn: h.day(30),
      groundsNote: h.groundsNote,
    });

    const pass = await revocation().sweep(at(afterGrace()));

    expect(pass).toMatchObject({ rights: 0, failed: 0 });
    expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', wire.id)).toEqual([]);
    expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', pending.id)).toEqual([]);
  }, 240_000);

  it('QĐ-110p: tells the person once more on the day of the reminder, once, and not the day before nor after the last day', async () => {
    const { dest, person, code } = await example();
    await h.seatOf(person, { subscriptionId: k2 }, code);
    const wire = await h.moveToday(person, dest.department);

    expect((await telling().remind(at(addDays(grace().reminderOn, -1)))).told).toBe(0);
    expect(await noticesOf('TRANSFER_GRACE_ENDING', wire.id)).toEqual([]);
    const pass = await telling().remind(at(grace().reminderOn));

    expect(pass).toMatchObject({ told: 1, failed: 0 });
    const notices = await noticesOf('TRANSFER_GRACE_ENDING', wire.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      recipient: person.employeeId,
      params: { transferId: wire.id, employeeId: person.employeeId, graceEndsOn: grace().endsOn },
    });
    expect((await transferRow(wire.id)).reminded).toBe(true);
    // Once: the pass again, and the passes of the days after, tell nobody.
    expect((await telling().remind(at(grace().reminderOn))).told).toBe(0);
    expect((await telling().remind(at(grace().endsOn))).told).toBe(0);
    expect(await noticesOf('TRANSFER_GRACE_ENDING', wire.id)).toHaveLength(1);
  }, 240_000);

  it('does not remind a person who holds nothing to lose, and does not remind after the last day', async () => {
    const empty = await example();
    const emptyTransfer = await h.moveToday(empty.person, empty.dest.department);
    const late = await example();
    await h.seatOf(late.person, { subscriptionId: k2 }, late.code);
    const lateTransfer = await h.moveToday(late.person, late.dest.department);

    await telling().remind(at(grace().reminderOn));
    await telling().remind(at(afterGrace()));

    expect(await noticesOf('TRANSFER_GRACE_ENDING', emptyTransfer.id)).toEqual([]);
    // The one who was reminded on its day only: the pass after the last day finds nothing owed to either.
    expect(await noticesOf('TRANSFER_GRACE_ENDING', lateTransfer.id)).toHaveLength(1);
    expect((await transferRow(emptyTransfer.id)).reminded).toBe(true);
  }, 240_000);

  it('m-17: tells the start of the grace of a transfer from before the grace existed — the person, both heads, the IT Admin of each department — once, and keeps the picture of the rights', async () => {
    const { u, dest, person, code } = await example();
    const seat = await h.seatOf(person, { subscriptionId: k2 }, code);
    const wire = await h.moveToday(person, dest.department);
    await asLegacy(wire.id);
    expect(await noticesOf('TRANSFER_GRACE_STARTED', wire.id)).toEqual([]);

    const pass = await telling().announceUnannounced(at(h.today()));

    expect(pass).toMatchObject({ told: 1, failed: 0 });
    const notices = await noticesOf('TRANSFER_GRACE_STARTED', wire.id);
    const audienceOf = (employeeId: string) =>
      notices.find((notice) => notice.recipient === employeeId)?.params.audience;
    expect(audienceOf(person.employeeId)).toBe('MOVER');
    expect(audienceOf(u.head.employeeId)).toBe('HEAD');
    expect(audienceOf(dest.head.employeeId)).toBe('HEAD');
    expect(audienceOf(h.it1.employeeId)).toBe('IT_ADMIN');
    expect(audienceOf(it2.employeeId)).toBe('IT_ADMIN');
    for (const notice of notices) expect(notice.params).toMatchObject({ graceEndsOn: grace().endsOn });
    const stored = await transferRow(wire.id);
    expect(stored.snapshot_before).toMatchObject({ takenOn: h.today() });
    expect(stored.snapshot_before?.rights.map((right) => right.assignmentId)).toEqual([seat]);
    // Once: the next pass finds the picture and tells nobody.
    expect((await telling().announceUnannounced(at(h.today()))).told).toBe(0);
    expect(await noticesOf('TRANSFER_GRACE_STARTED', wire.id)).toHaveLength(notices.length);
  }, 240_000);

  it('m-17: a transfer the settlement of the day opened is not told again, and one whose grace is over is not told the start', async () => {
    const fresh = await example();
    const freshTransfer = await h.moveToday(fresh.person, fresh.dest.department);
    const over = await example();
    const overTransfer = await h.moveToday(over.person, over.dest.department);
    await asLegacy(overTransfer.id);
    const before = await noticesOf('TRANSFER_GRACE_STARTED', freshTransfer.id);

    const pass = await telling().announceUnannounced(at(afterGrace()));

    expect(pass.told).toBe(0);
    expect(await noticesOf('TRANSFER_GRACE_STARTED', freshTransfer.id)).toEqual(before);
    expect(await noticesOf('TRANSFER_GRACE_STARTED', overTransfer.id)).toEqual([]);
  }, 240_000);

  it('m-17: the revocation of a transfer from before the grace keeps the picture of the rights it takes back', async () => {
    const { dest, person, code } = await example();
    const seat = await h.seatOf(person, { subscriptionId: k2 }, code);
    const wire = await h.moveToday(person, dest.department);
    await asLegacy(wire.id);

    await revocation().sweep(at(afterGrace()));

    const stored = await transferRow(wire.id);
    expect(stored.snapshot_before?.rights.map((right) => right.assignmentId)).toEqual([seat]);
    expect((await tasksOf([seat])).map((row) => row.revocation_source)).toEqual(['TRANSFER']);
  }, 240_000);
});
