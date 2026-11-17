import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { TransferRevocationService } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.service';
import type { ApiAccount } from '../../support/api-accounts';
import { DashboardHarness } from '../../support/dashboard-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new DashboardHarness();
/** The tables a departure or a transfer, or a preview of one, could touch: a preview must leave every one of them as it found it. */
const TABLES = [
  'access_requests',
  'access_request_steps',
  'budget_commitments',
  'budget_commitment_releases',
  'provisioning_tasks',
  'provisioning_task_reasons',
  'license_assignments',
  'offboarding_cases',
  'offboarding_case_changes',
  'department_transfers',
  'department_transfer_changes',
  'employee_placements',
  'department_head_periods',
  'audit_events',
  'in_app_notifications',
  'email_outbox',
  'it_admin_handovers',
] as const;

interface PreviewWire {
  rightsToRevoke: { assignmentId: string; provisioningType: string; revocable: boolean }[];
  openRequestsToCancel: unknown[];
  provisioningInFlight: unknown[];
  commitmentToRelease: unknown[];
  responsibilities: { subscriptions: number; applications: number };
  vendorAdminRoles: string[];
  headSuccessorRequired: boolean;
  revocationDueOn?: string;
  graceEndsOn?: string;
  graceReminderOn?: string;
}

/**
 * RD.3 (P23, `QĐ-110` G2 (3), MIN-7): the preview of a departure and of a transfer on real PostgreSQL. It runs the body of the record through the very checks
 * of the record and reads the very impact the record reads, in a transaction that is rolled back: so it writes nothing, it refuses as the record refuses,
 * and for a transfer it says the rights the sweeper of the grace then really takes back (the picture of the rights the day it takes effect, `isOldRightOf`).
 */
describe('the preview of a departure and of a transfer (integration, real PostgreSQL)', () => {
  let des: { department: Department; head: Person };
  let dest: { department: Department; head: Person };
  let it1: ApiAccount;
  let counter = 0;
  let k1: string;
  let k2: string;
  let k2b: string;
  let internal: string;

  const today = () => h.today();
  const person = async (department: Department): Promise<Person & { code: string }> => {
    const code = `PV-${(counter += 1)}`;

    return Object.assign(await h.employeeIn(department, code), { code });
  };
  const departureBody = (leaver: Person, extra: object = {}) => ({
    employeeId: leaver.employeeId,
    lastWorkingDay: h.day(10),
    accessBlockMode: 'WITH_LAST_DAY',
    groundsNote: h.groundsNote,
    ...extra,
  });
  const transferBody = (mover: Person, extra: object = {}) => ({
    employeeId: mover.employeeId,
    toDepartmentId: dest.department.id,
    effectiveOn: today(),
    groundsNote: h.groundsNote,
    ...extra,
  });
  const previewDeparture = (body: object, account: ApiAccount = h.sa) =>
    request(h.server()).post('/api/v1/offboarding-cases/preview').set(h.as(account)).send(body);
  const previewTransfer = (body: object, account: ApiAccount = h.sa) =>
    request(h.server()).post('/api/v1/department-transfers/preview').set(h.as(account)).send(body);
  const recordDeparture = (body: object) =>
    request(h.server()).post('/api/v1/offboarding-cases').set(h.as(h.sa)).send(body);
  const recordTransfer = (body: object) =>
    request(h.server()).post('/api/v1/department-transfers').set(h.as(h.sa)).send(body);
  const outcome = (response: { status: number; body: unknown }): [number, string | null] => [
    response.status,
    (response.body as { error?: { code?: string } }).error?.code ?? null,
  ];
  const digest = async (): Promise<Record<string, string>> => {
    const found: Record<string, string> = {};
    for (const table of TABLES) {
      const { rows } = await h.ctx.sql.query<{ digest: string }>(
        `SELECT coalesce(md5(string_agg(t::text, ',' ORDER BY t::text)), '') AS digest FROM ${table} t`,
      );
      found[table] = rows[0].digest;
    }

    return found;
  };

  beforeAll(async () => {
    await h.start();
    it1 = h.it1;
    des = await h.departmentWithHead('P-PV-DES');
    dest = await h.departmentWithHead('P-PV-DEST');
    await h.setItAdminInCharge(des.department, { employeeId: it1.employeeId, account: it1 });
    await h.setItAdminInCharge(dest.department, { employeeId: it1.employeeId, account: it1 });
    k1 = await h.subscription(40, 'K1', des.department.id);
    k2 = await h.subscription(40, 'K2', des.department.id);
    k2b = await h.subscription(40, 'K2', des.department.id);
    internal = await h.plan('K5');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('it only reads', () => {
    it('leaves every table it could touch exactly as it found it, for a departure and for a transfer, and answers 200', async () => {
      const leaver = await person(des.department);
      await h.rightOf(leaver, leaver.code, { subscriptionId: k2 });
      const mover = await person(des.department);
      await h.rightOf(mover, mover.code, { subscriptionId: k1 });
      const before = await digest();

      const departure = await previewDeparture(departureBody(leaver));
      const transfer = await previewTransfer(transferBody(mover));
      // Asked again, and the way it is refused: still nothing.
      await previewDeparture(departureBody(leaver));
      await previewDeparture(departureBody(leaver, { employeeId: '00000000-0000-4000-8000-000000000000' }));

      expect([departure.status, transfer.status]).toEqual([200, 200]);
      expect(departure.body).toMatchObject({ success: true, message: 'OFFBOARDING_CASE.PREVIEWED' });
      expect(transfer.body).toMatchObject({ success: true, message: 'DEPARTMENT_TRANSFER.PREVIEWED' });
      expect(await digest()).toEqual(before);
    });

    it('does not hold the person: the record that follows goes through, and the preview is not in the way of a second preview', async () => {
      const leaver = await person(des.department);

      await previewDeparture(departureBody(leaver)).expect(200);
      await previewDeparture(departureBody(leaver)).expect(200);

      await recordDeparture(departureBody(leaver)).expect(201);
    });
  });

  describe('it refuses as the record refuses', () => {
    it('gives the status and the code of the record for a departure the record would refuse', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      const handing = await person(des.department);
      await recordDeparture(departureBody(handing)).expect(201);
      const bodies = [
        {
          employeeId: unknown,
          lastWorkingDay: h.day(10),
          accessBlockMode: 'WITH_LAST_DAY',
          groundsNote: h.groundsNote,
        },
        departureBody(handing),
        departureBody(await person(des.department), { lastWorkingDay: undefined }),
        departureBody(await person(des.department), { lastWorkingDay: addDays(today(), -3) }),
        departureBody(await person(des.department), { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.day(10) }),
        departureBody(await person(des.department), { groundsNote: '   ' }),
        departureBody(await person(des.department), { groundsNote: 'x'.repeat(501) }),
        departureBody(await person(des.department), { surprise: true }),
      ];

      const answers: [[number, string | null], [number, string | null]][] = [];
      for (const body of bodies)
        answers.push([outcome(await previewDeparture(body)), outcome(await recordDeparture(body))]);

      for (const [preview, record] of answers) expect(preview).toEqual(record);
      expect(answers.map(([preview]) => preview[0])).toEqual([404, 409, 422, 422, 422, 422, 422, 422]);
    });

    it('gives the status and the code of the record for a transfer the record would refuse', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      const left = await person(des.department);
      await recordDeparture(departureBody(left, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: today() })).expect(201);
      const bodies = [
        transferBody({ employeeId: unknown } as Person),
        transferBody(left),
        transferBody(await person(des.department), { toDepartmentId: des.department.id }),
        transferBody(await person(des.department), { effectiveOn: addDays(today(), -2) }),
        transferBody(await person(des.department), { toDepartmentId: unknown }),
        transferBody(await person(des.department), { groundsNote: '' }),
        transferBody(await person(des.department), { surprise: true }),
      ];

      const answers: [[number, string | null], [number, string | null]][] = [];
      for (const body of bodies)
        answers.push([outcome(await previewTransfer(body)), outcome(await recordTransfer(body))]);

      for (const [preview, record] of answers) expect(preview).toEqual(record);
      expect(answers.map(([preview]) => preview[0])).toEqual([404, 409, 422, 422, 422, 422, 422]);
    });

    it('asks for the successor of a head the way the record does: 422 PERSONNEL.SUCCESSOR_REQUIRED for a departure and for a transfer', async () => {
      const head = await h.departmentWithHead(`P-PV-HEAD-${(counter += 1)}`);

      const departure = await previewDeparture(departureBody(head.head));
      const transfer = await previewTransfer(transferBody(head.head, { effectiveOn: h.day(5) }));

      expect(outcome(departure)).toEqual([422, 'PERSONNEL.SUCCESSOR_REQUIRED']);
      expect(outcome(transfer)).toEqual([422, 'PERSONNEL.SUCCESSOR_REQUIRED']);
    });

    it('says a head who names a successor needs one: `headSuccessorRequired` is true and nothing is written', async () => {
      const head = await h.departmentWithHead(`P-PV-HEAD-${(counter += 1)}`);
      const successor = await h.employeeIn(head.department, `PV-S-${(counter += 1)}`, ['MANAGER']);
      const before = await digest();

      const named = { successor: { kind: 'EMPLOYEE', employeeId: successor.employeeId } };
      const departure = await previewDeparture(departureBody(head.head, named));
      // The head took the place today: the transfer is for a later day, after the first day of their placement.
      const transfer = await previewTransfer(transferBody(head.head, { ...named, effectiveOn: h.day(5) }));
      expect([outcome(departure), outcome(transfer)]).toEqual([
        [200, null],
        [200, null],
      ]);

      expect((departure.body as { data: PreviewWire }).data.headSuccessorRequired).toBe(true);
      expect((transfer.body as { data: PreviewWire }).data.headSuccessorRequired).toBe(true);
      expect(await digest()).toEqual(before);
    });
  });

  describe('who may ask', () => {
    it('is the Super Admin only, never about themselves, and nothing without a token', async () => {
      const subject = await person(des.department);
      const callers: [string, ApiAccount][] = [
        ['IT Admin', it1],
        ['head', des.head.account],
        ['Finance', h.finance],
        ['employee', subject.account],
      ];
      const answers: number[] = [];
      for (const [, account] of callers) {
        answers.push((await previewDeparture(departureBody(subject), account)).status);
        answers.push((await previewTransfer(transferBody(subject), account)).status);
      }

      expect(answers).toEqual([403, 403, 403, 403, 403, 403, 403, 403]);
      expect(
        (await request(h.server()).post('/api/v1/offboarding-cases/preview').send(departureBody(subject))).status,
      ).toBe(401);
      expect(
        (await request(h.server()).post('/api/v1/department-transfers/preview').send(transferBody(subject))).status,
      ).toBe(401);
      // About themselves the record refuses the Super Admin, and so does the preview.
      const own = { employeeId: h.sa.employeeId };
      expect(outcome(await previewDeparture(departureBody(own as Person)))).toEqual([
        403,
        'PERSONNEL.SELF_CHANGE_FORBIDDEN',
      ]);
      expect(outcome(await previewTransfer(transferBody(own as Person)))).toEqual([
        403,
        'PERSONNEL.SELF_CHANGE_FORBIDDEN',
      ]);
    });
  });

  describe('a departure: what the record then keeps', () => {
    it('names the seats and the deadline the record then shows: the same rights as the case lists, and the deadline of the case', async () => {
      const leaver = await person(des.department);
      const seats = [
        await h.rightOf(leaver, leaver.code, { subscriptionId: k1 }),
        await h.rightOf(leaver, leaver.code, { subscriptionId: k2 }),
      ];

      const body = departureBody(leaver);
      const preview = (await previewDeparture(body).expect(200)).body as { data: PreviewWire };
      const wire = h.dataOf<{ id: string; revocation: { dueOn: string } }>(await recordDeparture(body).expect(201));
      const rights = h.dataOf<{ items: { assignmentId: string }[] }>(
        await h.rightsOf(wire.id, '?pageSize=100').expect(200),
      ).items;

      expect(preview.data.rightsToRevoke.map((right) => right.assignmentId).sort()).toEqual([...seats].sort());
      expect(rights.map((right) => right.assignmentId).sort()).toEqual([...seats].sort());
      expect(preview.data.revocationDueOn).toBe(wire.revocation.dueOn);
    });
  });

  describe('a transfer: the rights the sweeper of the grace then takes back', () => {
    /** The grace of a transfer moved into the past: the table guards its columns, so only this fixture turns the guard off. */
    const endGrace = async (transferId: string): Promise<void> => {
      const ends = addDays(today(), -3);
      await h.ctx.sql.query('BEGIN');
      try {
        await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
        await h.ctx.sql.query(
          'UPDATE department_transfers SET effective_on = $2, grace_reminder_on = $3, grace_ends_on = $4 WHERE id = $1',
          [transferId, addDays(ends, -4), addDays(ends, -2), ends],
        );
        await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
        await h.ctx.sql.query('COMMIT');
      } catch (error) {
        await h.ctx.sql.query('ROLLBACK');
        throw error;
      }
    };
    const taskedBy = async (transferId: string): Promise<string[]> =>
      (
        await h.ctx.sql.query<{ assignment_id: string }>(
          `SELECT t.assignment_id FROM provisioning_tasks t JOIN provisioning_task_reasons r ON r.task_id = t.id
            WHERE r.reference_id = $1 AND r.source = 'TRANSFER' ORDER BY t.assignment_id`,
          [transferId],
        )
      ).rows.map((row) => row.assignment_id);

    it('is exactly the set the sweeper opens a revocation for: the open rights of a kind that can be taken away, not the ones that end by themselves', async () => {
      const mover = await person(des.department);
      const open = [
        await h.rightOf(mover, mover.code, { subscriptionId: k1 }),
        await h.rightOf(mover, mover.code, { subscriptionId: k2 }),
        await h.rightOf(mover, mover.code, { planId: internal }),
      ];
      // A right that ends by itself: the revocation of another source took its end, so the sweeper leaves it.
      const ending = await h.rightOf(mover, mover.code, { subscriptionId: k2b });
      await h.ctx.sql.query('UPDATE license_assignments SET valid_until = $2 WHERE id = $1', [
        ending,
        addDays(today(), 20),
      ]);

      const preview = (await previewTransfer(transferBody(mover)).expect(200)).body as { data: PreviewWire };
      await h.moveToday(mover, dest.department);
      const { rows } = await h.ctx.sql.query<{ id: string }>(
        'SELECT id FROM department_transfers WHERE employee_id = $1',
        [mover.employeeId],
      );
      await endGrace(rows[0].id);
      await h.ctx.app.get(TransferRevocationService, { strict: false }).sweep(new Date());

      const previewed = preview.data.rightsToRevoke.map((right) => right.assignmentId).sort();
      expect(previewed).toEqual([...open].sort());
      expect(await taskedBy(rows[0].id)).toEqual(previewed);
      expect(previewed).not.toContain(ending);
      expect(preview.data.rightsToRevoke.every((right) => right.revocable)).toBe(true);
    });

    it('keeps the grace of the record: the last day and the reminder the record then keeps on the transfer', async () => {
      const mover = await person(des.department);

      const preview = (await previewTransfer(transferBody(mover)).expect(200)).body as { data: PreviewWire };
      await h.moveToday(mover, dest.department);
      const { rows } = await h.ctx.sql.query<{ ends: string; reminder: string }>(
        `SELECT to_char(grace_ends_on, 'YYYY-MM-DD') AS ends, to_char(grace_reminder_on, 'YYYY-MM-DD') AS reminder
           FROM department_transfers WHERE employee_id = $1`,
        [mover.employeeId],
      );

      expect([preview.data.graceEndsOn, preview.data.graceReminderOn]).toEqual([rows[0].ends, rows[0].reminder]);
    });
  });
});
