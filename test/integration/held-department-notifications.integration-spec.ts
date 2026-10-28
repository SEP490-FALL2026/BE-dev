import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { InvalidInAppNotificationError } from '../../src/modules/notifications/notifications.errors';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import type { HeldDepartmentNotificationInput } from '../../src/modules/notifications/notifications.types';
import { StatusHarness } from '../support/status-harness';

const h = new StatusHarness();
const CHECK = '23514';
const UNIQUE = '23505';
const FOREIGN_KEY = '23503';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/**
 * `g0-g6-final-business-baseline-remediation`, F67 and T-11: a notice for the head of a department that has none is kept, not
 * dropped, and handed to the first head the Super Admin names, once, in the transaction of that assignment.
 */
describe('notices held for a department without a head (integration, PostgreSQL)', () => {
  const runner = () => h.ctx.app.get(TransactionRunner, { strict: false });
  const notifications = () => h.ctx.app.get(NotificationsService, { strict: false });
  let departmentId: string;
  let otherDepartmentId: string;
  let firstHead: { employeeId: string };
  let bystander: { employeeId: string };

  const held = (overrides: Partial<HeldDepartmentNotificationInput> = {}): HeldDepartmentNotificationInput => ({
    organizationId: h.seed.organizationId,
    departmentId,
    code: 'BUDGET_PROPOSAL_RETURNED',
    subject: { type: 'BUDGET_PROPOSAL', id: randomUUID() },
    params: { proposalId: randomUUID(), costCenterId: randomUUID(), year: 2026, reason: 'Please resend' },
    eventKey: `held-${randomUUID()}`,
    ...overrides,
  });
  const hold = (input: HeldDepartmentNotificationInput) =>
    runner().run((tx) => notifications().holdForDepartment(tx, input));
  const deliver = (employeeId: string, forDepartment = departmentId) =>
    runner().run((tx) =>
      notifications().deliverHeldToHead(tx, {
        organizationId: h.seed.organizationId,
        departmentId: forDepartment,
        headEmployeeId: employeeId,
      }),
    );
  const rowsOf = async (key: string) =>
    (
      await h.ctx.sql.query<{ delivered_at: Date | null; delivered_to_employee_id: string | null }>(
        `SELECT delivered_at, delivered_to_employee_id FROM held_department_notifications WHERE event_key = $1`,
        [key],
      )
    ).rows;

  beforeAll(async () => {
    await h.start();
    const department = await h.departmentWithUnit('P-HELD');
    const other = await h.departmentWithUnit('P-HELD2');
    departmentId = department.id;
    otherDepartmentId = other.id;
    firstHead = await h.staff(department, 'HELD-H1');
    bystander = await h.staff(other, 'HELD-B1');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('what the database refuses whoever writes', () => {
    const insert = (overrides: { key?: string; subjectType?: string | null; subjectId?: string | null } = {}) =>
      sqlState(
        `INSERT INTO held_department_notifications (id, organization_id, department_id, code, subject_type, subject_id, event_key)
         VALUES (gen_random_uuid(), $1, $2, 'BUDGET_PROPOSAL_RETURNED', $3, $4, $5)`,
        [
          h.seed.organizationId,
          departmentId,
          overrides.subjectType === undefined ? null : overrides.subjectType,
          overrides.subjectId === undefined ? null : overrides.subjectId,
          overrides.key ?? `held-${randomUUID()}`,
        ],
      );

    it('keeps one notice per event key (23505)', async () => {
      const key = `held-${randomUUID()}`;

      expect(await insert({ key })).toBeNull();
      expect(await insert({ key })).toBe(UNIQUE);
    });

    it('takes a subject whole or not at all (23514)', async () => {
      expect(await insert({ subjectType: 'BUDGET_PROPOSAL', subjectId: null })).toBe(CHECK);
      expect(await insert({ subjectType: null, subjectId: randomUUID() })).toBe(CHECK);
    });

    it('records the person and the moment of a delivery together (23514)', async () => {
      const key = `held-${randomUUID()}`;
      await insert({ key });

      expect(
        await sqlState(`UPDATE held_department_notifications SET delivered_at = now() WHERE event_key = $1`, [key]),
      ).toBe(CHECK);
      expect(
        await sqlState(`UPDATE held_department_notifications SET delivered_to_employee_id = $2 WHERE event_key = $1`, [
          key,
          firstHead.employeeId,
        ]),
      ).toBe(CHECK);
    });

    it('refuses a department that does not exist (23503)', async () => {
      expect(
        await sqlState(
          `INSERT INTO held_department_notifications (id, organization_id, department_id, code, event_key)
           VALUES (gen_random_uuid(), $1, gen_random_uuid(), 'BUDGET_PROPOSAL_RETURNED', $2)`,
          [h.seed.organizationId, `held-${randomUUID()}`],
        ),
      ).toBe(FOREIGN_KEY);
    });
  });

  describe('holding a notice in the transaction of the event behind it', () => {
    it('keeps it and says so, and says false for the same event key without keeping it twice', async () => {
      const input = held();

      expect(await hold(input)).toBe(true);
      expect(await hold(input)).toBe(false);

      expect(await rowsOf(input.eventKey)).toEqual([{ delivered_at: null, delivered_to_employee_id: null }]);
    });

    it('is gone when the event rolls back, and exists exactly when it commits', async () => {
      const kept = held();
      const lost = held();

      await runner().run(async (tx) => {
        await notifications().holdForDepartment(tx, kept);
      });
      await expect(
        runner().run(async (tx) => {
          await notifications().holdForDepartment(tx, lost);
          throw new Error('the event behind it failed');
        }),
      ).rejects.toThrow('the event behind it failed');

      expect(await rowsOf(kept.eventKey)).toHaveLength(1);
      expect(await rowsOf(lost.eventKey)).toHaveLength(0);
    });

    it('refuses a notice the closed table does not take, and keeps nothing', async () => {
      const before = await h.count('held_department_notifications');

      await expect(hold(held({ code: 'NOT_A_CODE' as never }))).rejects.toBeInstanceOf(InvalidInAppNotificationError);
      await expect(hold(held({ params: { proposalId: randomUUID(), passwordHash: 'x' } }))).rejects.toMatchObject({
        refusal: { reason: 'PARAM_KEY_FORBIDDEN' },
      });
      await expect(hold(held({ params: { proposalId: randomUUID(), amountMinor: 5 } }))).rejects.toMatchObject({
        refusal: { reason: 'PARAM_KEY_NOT_ALLOWED' },
      });

      expect(await h.count('held_department_notifications')).toBe(before);
    });
  });

  describe('naming the first head', () => {
    it('hands every held notice of the department to that head once, and to nobody else', async () => {
      const first = held();
      const second = held({
        code: 'BUDGET_VERSION_CLOSED_UNAPPROVED',
        params: { versionId: randomUUID(), costCenterId: randomUUID(), year: 2026 },
      });
      const elsewhere = held({ departmentId: otherDepartmentId });
      await hold(first);
      await hold(second);
      await hold(elsewhere);
      const inboxBefore = (await h.noticesOf(firstHead.employeeId)).length;

      const handed = await deliver(firstHead.employeeId);

      expect(handed).toBeGreaterThanOrEqual(2);
      const mine = await h.noticesOf(firstHead.employeeId);
      expect(mine).toHaveLength(inboxBefore + handed);
      expect(mine.map((row) => row.event_key)).toEqual(expect.arrayContaining([first.eventKey, second.eventKey]));
      expect(mine.map((row) => row.event_key)).not.toContain(elsewhere.eventKey);
      for (const input of [first, second]) {
        const [row] = await rowsOf(input.eventKey);
        expect(row.delivered_to_employee_id).toBe(firstHead.employeeId);
        expect(row.delivered_at).not.toBeNull();
      }
      expect(await rowsOf(elsewhere.eventKey)).toEqual([{ delivered_at: null, delivered_to_employee_id: null }]);
      expect((await h.noticesOf(bystander.employeeId)).map((row) => row.event_key)).not.toContain(elsewhere.eventKey);
    });

    it('hands nothing a second time, even to another person', async () => {
      const input = held();
      await hold(input);
      expect(await deliver(firstHead.employeeId)).toBeGreaterThanOrEqual(1);
      const inbox = (await h.noticesOf(firstHead.employeeId)).length;

      expect(await deliver(firstHead.employeeId)).toBe(0);
      expect(await deliver(bystander.employeeId)).toBe(0);

      expect((await h.noticesOf(firstHead.employeeId)).length).toBe(inbox);
      expect((await h.noticesOf(bystander.employeeId)).map((row) => row.event_key)).not.toContain(input.eventKey);
    });

    it('hands over with the transaction: a delivery that rolls back leaves the notice held', async () => {
      const input = held();
      await hold(input);

      await expect(
        runner().run(async (tx) => {
          await notifications().deliverHeldToHead(tx, {
            organizationId: h.seed.organizationId,
            departmentId,
            headEmployeeId: firstHead.employeeId,
          });
          throw new Error('naming the head failed');
        }),
      ).rejects.toThrow('naming the head failed');

      expect(await rowsOf(input.eventKey)).toEqual([{ delivered_at: null, delivered_to_employee_id: null }]);
      expect((await h.noticesOf(firstHead.employeeId)).map((row) => row.event_key)).not.toContain(input.eventKey);
    });

    it('keeps the event key of the notice, so the inbox does not take it twice', async () => {
      const input = held();
      await hold(input);
      await deliver(firstHead.employeeId);

      const rows = (await h.noticesOf(firstHead.employeeId)).filter((row) => row.event_key === input.eventKey);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ code: 'BUDGET_PROPOSAL_RETURNED', subject_type: 'BUDGET_PROPOSAL' });
    });
  });
});
