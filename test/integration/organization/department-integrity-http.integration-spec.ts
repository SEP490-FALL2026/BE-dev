import { Client } from 'pg';
import { DepartmentHarness, today, addDays } from '../../support/department-harness';

describe('department profiles, heads and the MANAGER role over HTTP (integration, real PostgreSQL): what the database keeps true and the lock protocol', () => {
  const h = new DepartmentHarness();
  const { newDepartment, enter, assignHead } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('what the database keeps true by itself (INV-19, QĐ-66a)', () => {
    const insertPeriod = (departmentId: string, employeeId: string, from: string, to: string | null) =>
      h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
        [h.seed.organizationId, departmentId, employeeId, from, to],
      );

    it('allows one head at a time: a second period over the same days is refused', async () => {
      const department = await newDepartment();
      const first = await enter(department.code);
      const second = await enter(department.code);
      // Days are relative to today: a member's placement starts today, so a fixed calendar date goes stale.
      const start = addDays(today(), 10);
      const end = addDays(today(), 40);
      await insertPeriod(department.id, first.employeeId, start, end);

      await expect(insertPeriod(department.id, second.employeeId, addDays(today(), 25), null)).rejects.toMatchObject({
        code: '23P01',
      });
      await expect(insertPeriod(department.id, second.employeeId, end, null)).resolves.toBeDefined();
    });

    it('lets a person head only one department on any day: the member rule and the exclusion both refuse overlap', async () => {
      const first = await newDepartment();
      const second = await newDepartment();
      const person = await enter(first.code);
      const transfer = addDays(today(), 40);
      // The same person is a member of the second department from a later day (a transfer), by SQL.
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL`,
        [person.employeeId, transfer],
      );
      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [h.seed.organizationId, person.employeeId, second.id, transfer],
      );
      await insertPeriod(first.id, person.employeeId, today(), transfer);

      // Heading the second department before the transfer is refused: not a member yet (a second guard, the
      // exclusion on the person, would refuse it too if the placements ever overlapped).
      const refusal: unknown = await insertPeriod(second.id, person.employeeId, addDays(today(), 30), null).catch(
        (error: unknown) => error,
      );
      expect(['23514', '23P01']).toContain((refusal as { code?: string }).code);
      await expect(insertPeriod(second.id, person.employeeId, transfer, null)).resolves.toBeDefined();
      await h.ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [person.employeeId]);
      await h.ctx.sql.query('DELETE FROM employee_placements WHERE employee_id = $1 AND valid_from = $2', [
        person.employeeId,
        transfer,
      ]);
      await h.ctx.sql.query('UPDATE employee_placements SET valid_to = NULL WHERE employee_id = $1', [
        person.employeeId,
      ]);
    });

    it('refuses a head who is not a member of the department for the whole period', async () => {
      const department = await newDepartment();
      const elsewhere = await enter('P-OPS');
      const member = await enter(department.code);
      const periodStart = addDays(today(), 10);
      const placementEnd = addDays(today(), 20);

      await expect(insertPeriod(department.id, elsewhere.employeeId, periodStart, null)).rejects.toMatchObject({
        code: '23514',
      });
      // A closed placement that ends before the period does.
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL`,
        [member.employeeId, placementEnd],
      );
      await expect(insertPeriod(department.id, member.employeeId, periodStart, null)).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insertPeriod(department.id, member.employeeId, today(), placementEnd)).resolves.toBeDefined();
      await h.ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [member.employeeId]);
      await h.ctx.sql.query('UPDATE employee_placements SET valid_to = NULL WHERE employee_id = $1', [
        member.employeeId,
      ]);
    });

    it('refuses an empty or backwards period', async () => {
      const department = await newDepartment();
      const member = await enter(department.code);

      const day = addDays(today(), 10);

      await expect(insertPeriod(department.id, member.employeeId, day, day)).rejects.toMatchObject({
        code: '23514',
      });
    });
  });

  describe('the lock protocol: two heads named at once', () => {
    let holder: Client;

    beforeAll(async () => {
      holder = new Client({ connectionString: h.ctx.database.url });
      await holder.connect();
    });

    afterAll(async () => {
      await holder?.end();
    });

    afterEach(async () => {
      await holder.query('ROLLBACK').catch(() => undefined);
    });

    async function waitForWaiters(observer: Client, count: number, timeoutMs = 10000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const { rows } = await observer.query<{ waiting: number }>(
          'SELECT count(*)::int AS waiting FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE NOT l.granted AND a.datname = current_database()',
        );
        if (rows[0].waiting >= count) return;
        if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    it('leaves exactly one head on each day, in either order, with no deadlock', async () => {
      const deadlocks = async () =>
        (
          await h.ctx.sql.query<{ n: number }>(
            'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
          )
        ).rows[0].n;
      const deadlocksBefore = await deadlocks();
      for (let round = 0; round < 4; round += 1) {
        const department = await newDepartment();
        const first = await enter(department.code);
        const second = await enter(department.code);

        await holder.query('BEGIN');
        await holder.query('SELECT id FROM departments WHERE id = $1 FOR UPDATE', [department.id]);
        const a = assignHead(department.id, first.employeeId).then((r) => r);
        const b = assignHead(department.id, second.employeeId).then((r) => r);
        await waitForWaiters(h.ctx.sql, 2);
        await holder.query('COMMIT');
        const [one, two] = await Promise.all([a, b]);

        // Both are accepted one after the other; the later one is the head and the earlier one's period is gone,
        // because both began today and the later decision replaces the earlier one.
        expect([one.status, two.status]).toEqual([200, 200]);
        const periods = await h.ctx.sql.query<{ employee_id: string; valid_to: string | null }>(
          'SELECT employee_id, valid_to FROM department_head_periods WHERE department_id = $1',
          [department.id],
        );
        expect(periods.rows).toHaveLength(1);
        expect(periods.rows[0].valid_to).toBeNull();
        expect([first.employeeId, second.employeeId]).toContain(periods.rows[0].employee_id);
      }
      expect(await deadlocks()).toBe(deadlocksBefore);
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await h.placementViolations()).toEqual([]);
  });
});
