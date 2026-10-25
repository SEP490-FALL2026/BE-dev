import { randomUUID } from 'node:crypto';
import type { Department, Person } from '../support/request-harness';
import { ServiceAccountHandoverHarness } from '../support/service-account-handover-harness';

const h = new ServiceAccountHandoverHarness();

/** US-03-08: what the database refuses about the moves of service accounts, their reminders and the closing of a transfer. */
describe('the integrity of the handover of service accounts (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let subscription: string;
  let seq = 0;
  const code = () => `E-SI-${(seq += 1)}`;

  /** What the database answers with when it refuses `sql`: the SQLSTATE, or null when it took it. */
  const sqlState = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await h.ctx.sql.query(sql, params);

      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
  };

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    subscription = await h.subscription(100, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const bot = async () => {
    const employeeCode = code();
    const person = await h.worker(des, employeeCode);

    return { person, assignmentId: await h.botOf(person, subscription, `bot-${employeeCode}`, employeeCode) };
  };
  const insertMove = (assignmentId: string, to: Person, extra: { toDepartmentId?: string } = {}) =>
    sqlState(
      `INSERT INTO service_account_moves (id, organization_id, assignment_id, from_department_id, to_department_id,
         new_responsible_employee_id, effective_from, proposed_by_app_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        h.seed.organizationId,
        assignmentId,
        des.id,
        extra.toDepartmentId ?? fin.id,
        to.employeeId,
        h.day(10),
        randomUUID(),
      ],
    );

  describe('a proposal to move an account', () => {
    it('is one at a time for an assignment, and another may follow once it is decided (23505)', async () => {
      const { assignmentId } = await bot();
      const e6 = await h.worker(fin, code());

      expect(await insertMove(assignmentId, e6)).toBeNull();
      expect(await insertMove(assignmentId, e6)).toBe('23505');
      await h.ctx.sql.query(
        `UPDATE service_account_moves SET status = 'CANCELLED', cancelled_by_app_user_id = $2, cancelled_at = now(),
           cancelled_reason = 'Nhầm' WHERE assignment_id = $1`,
        [assignmentId, randomUUID()],
      );
      expect(await insertMove(assignmentId, e6)).toBeNull();
    });

    it('goes to another department, and never keeps a state without the columns that belong to it (23514)', async () => {
      const { assignmentId } = await bot();
      const e6 = await h.worker(fin, code());

      expect(await insertMove(assignmentId, e6, { toDepartmentId: des.id })).toBe('23514');
      expect(await insertMove(assignmentId, e6)).toBeNull();
      expect(
        await sqlState(`UPDATE service_account_moves SET status = 'CONFIRMED' WHERE assignment_id = $1`, [
          assignmentId,
        ]),
      ).toBe('23514');
      expect(
        await sqlState(
          `UPDATE service_account_moves SET status = 'CANCELLED', cancelled_by_app_user_id = $2, cancelled_at = now(),
             cancelled_reason = '  ' WHERE assignment_id = $1`,
          [assignmentId, randomUUID()],
        ),
      ).toBe('23514');
      expect(
        await sqlState(`UPDATE service_account_moves SET confirmed_at = now() WHERE assignment_id = $1`, [
          assignmentId,
        ]),
      ).toBe('23514');
    });

    it('is decided once and kept: what was proposed never changes and nothing is deleted (55000)', async () => {
      const { assignmentId } = await bot();
      const e6 = await h.worker(fin, code());
      await insertMove(assignmentId, e6);

      expect(
        await sqlState(
          `UPDATE service_account_moves SET effective_from = effective_from + 1 WHERE assignment_id = $1`,
          [assignmentId],
        ),
      ).toBe('55000');
      expect(
        await sqlState(`UPDATE service_account_moves SET to_department_id = $2 WHERE assignment_id = $1`, [
          assignmentId,
          h.seed.departmentId,
        ]),
      ).toBe('55000');
      await h.ctx.sql.query(
        `UPDATE service_account_moves SET status = 'CANCELLED', cancelled_by_app_user_id = $2, cancelled_at = now(),
           cancelled_reason = 'Nhầm' WHERE assignment_id = $1`,
        [assignmentId, randomUUID()],
      );
      expect(
        await sqlState(`UPDATE service_account_moves SET cancelled_reason = 'Đổi' WHERE assignment_id = $1`, [
          assignmentId,
        ]),
      ).toBe('55000');
      expect(await sqlState(`DELETE FROM service_account_moves WHERE assignment_id = $1`, [assignmentId])).toBe(
        '55000',
      );
    });
  });

  describe('the reminder of an account that still waits', () => {
    it('is written once for an account and a day, and never changed or deleted (23505, 55000)', async () => {
      const { assignmentId } = await bot();
      const insert = (day: string) =>
        sqlState(`INSERT INTO service_account_duty_notices (id, assignment_id, due_on) VALUES ($1, $2, $3)`, [
          randomUUID(),
          assignmentId,
          day,
        ]);

      expect(await insert(h.day(3))).toBeNull();
      expect(await insert(h.day(3))).toBe('23505');
      expect(await insert(h.day(4))).toBeNull();
      expect(
        await sqlState(`UPDATE service_account_duty_notices SET due_on = $2 WHERE assignment_id = $1 AND due_on = $3`, [
          assignmentId,
          h.day(9),
          h.day(3),
        ]),
      ).toBe('55000');
      expect(await sqlState(`DELETE FROM service_account_duty_notices WHERE assignment_id = $1`, [assignmentId])).toBe(
        '55000',
      );
    });
  });

  describe('the closing of a transfer', () => {
    const transferFor = async (effectiveOn: string) => {
      const person = await h.worker(des, code());

      return h.recorded({ employeeId: person.employeeId, toDepartmentId: fin.id, effectiveOn, grounds: h.grounds });
    };
    const close = (id: string, by: string | null = randomUUID()) =>
      sqlState(`UPDATE department_transfers SET closed_at = now(), closed_by_app_user_id = $2 WHERE id = $1`, [id, by]);

    it('is only of a transfer that has taken effect, and says who closed it (23514)', async () => {
      const waiting = await transferFor(h.day(10));

      expect(await close(waiting.id)).toBe('23514');
      expect(await close(waiting.id, null)).toBe('23514');
      expect(h.dataOf<{ closure: unknown }>(await h.readTransfer(waiting.id).expect(200)).closure).toBeNull();
    });

    it('changes nothing else of the transfer, and a closed transfer never changes again (23001)', async () => {
      const effective = await transferFor(h.today());
      expect(effective.status).toBe('EFFECTIVE');

      expect(
        await sqlState(
          `UPDATE department_transfers SET closed_at = now(), closed_by_app_user_id = $2, self_executed = NOT self_executed WHERE id = $1`,
          [effective.id, randomUUID()],
        ),
      ).toBe('23001');
      expect(
        await sqlState(`UPDATE department_transfers SET closed_by_app_user_id = $2 WHERE id = $1`, [
          effective.id,
          randomUUID(),
        ]),
      ).toBe('23001');
      expect(await close(effective.id)).toBeNull();
      expect(await close(effective.id)).toBe('23001');
      expect(await sqlState(`DELETE FROM department_transfers WHERE id = $1`, [effective.id])).toBe('23001');
    });
  });
});
