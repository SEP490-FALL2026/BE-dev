import { randomUUID } from 'node:crypto';
import type { Department } from '../../support/request-harness';
import { ServiceAccountHandoverHarness } from '../../support/service-account-handover-harness';

const h = new ServiceAccountHandoverHarness();

/** US-03-08: what the database refuses about the reminders of service accounts and the closing of a transfer. */
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
    // Every account of the suite answers to a person of P-DES, so the subscription is P-DES's: a seat sits only on a subscription
    // of its own department (F20), and a subscription always has an owner department (F02).
    subscription = await h.subscription(100, 'K2', des.id);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const bot = async () => {
    const employeeCode = code();
    const person = await h.worker(des, employeeCode);

    return { person, assignmentId: await h.botOf(person, subscription, `bot-${employeeCode}`, employeeCode) };
  };
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
