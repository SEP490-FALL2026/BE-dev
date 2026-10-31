import { randomUUID } from 'node:crypto';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import type { Department } from '../../support/request-harness';

const h = new OffboardingHarness();

/** US-03-04: what the database refuses about a departure, and the list, the rights and the detail in a fixed number of statements. */
describe('offboarding data and reads (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Department;
  let sequence = 0;
  const code = (prefix = 'E') => `${prefix}-OI-${(sequence += 1)}`;
  const sqlState = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await h.ctx.sql.query(sql, params);

      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
  };
  /** The columns every row of a case needs, with the ones a test changes passed as `extra`. */
  const insertCase = async (employeeId: string, extra: Record<string, string | null> = {}) => {
    const row: Record<string, string | null> = {
      id: randomUUID(),
      organization_id: h.seed.organizationId,
      employee_id: employeeId,
      department_id: des.id,
      state: 'HANDING_OVER',
      prior_work_state: 'WORKING',
      last_working_day: '2026-12-01',
      departure_effective_on: '2026-12-02',
      handover_due_on: '2026-11-30',
      grounds_type: 'DECISION',
      grounds_reference: 'QD-1',
      grounds_issuer: 'HR',
      grounds_issued_on: '2026-10-01',
      recorded_by_app_user_id: randomUUID(),
      ...extra,
    };
    const columns = Object.keys(row);

    return sqlState(
      `INSERT INTO offboarding_cases (${columns.join(', ')})
       VALUES (${columns.map((column, index) => (column === 'state' ? `$${index + 1}::"OffboardingState"` : column === 'prior_work_state' ? `$${index + 1}::"EmployeeWorkState"` : `$${index + 1}`)).join(', ')})`,
      columns.map((column) => row[column]),
    );
  };

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    des = await h.departmentWithUnit('P-INT');
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('what the database refuses', () => {
    it('keeps one live case for each person, and a case that is whole', async () => {
      const person = await h.worker(des, code());
      const wire = await h.recordedCase(person);

      expect(await insertCase(person.employeeId)).toBe('23505');
      await h.cancelCase(wire.id, { reason: 'Rút' }).expect(200);
      expect(await insertCase(person.employeeId)).toBeNull();

      const other = await h.worker(des, code());
      expect(await insertCase(other.employeeId, { state: 'LEFT' })).toBe('23514');
      expect(await insertCase(other.employeeId, { departure_effective_on: '2026-12-01' })).toBe('23514');
      expect(await insertCase(other.employeeId, { handover_due_on: null })).toBe('23514');
      expect(await insertCase(other.employeeId, { grounds_issuer: '  ' })).toBe('23514');
      expect(await insertCase(other.employeeId, { prior_work_state: 'HANDING_OVER' })).toBe('23514');
      expect(
        await insertCase(other.employeeId, { account_lock_note: 'khóa', account_lock_at: '2026-10-25T00:00:00Z' }),
      ).toBe('23514');
      expect(
        await insertCase(other.employeeId, { closed_at: '2026-10-25T00:00:00Z', closed_by_app_user_id: randomUUID() }),
      ).toBe('23514');
    });

    it('never changes a case that was cancelled, who it is about or its basis, and never deletes a case or a line of its log', async () => {
      const person = await h.worker(des, code());
      const wire = await h.recordedCase(person);
      await h.cancelCase(wire.id, { reason: 'Rút' }).expect(200);
      const live = await h.worker(des, code());
      const open = await h.recordedCase(live);

      expect(await sqlState(`UPDATE offboarding_cases SET cancel_reason = 'khác' WHERE id = $1`, [wire.id])).toBe(
        '55000',
      );
      expect(await sqlState(`UPDATE offboarding_cases SET grounds_reference = 'QD-2' WHERE id = $1`, [open.id])).toBe(
        '55000',
      );
      expect(await sqlState(`UPDATE offboarding_cases SET abrupt = true WHERE id = $1`, [open.id])).toBe('55000');
      expect(await sqlState(`UPDATE offboarding_cases SET state = 'HANDING_OVER' WHERE id = $1`, [wire.id])).toBe(
        '55000',
      );
      expect(await sqlState(`DELETE FROM offboarding_cases WHERE id = $1`, [open.id])).toBe('55000');
      expect(await sqlState(`TRUNCATE offboarding_cases CASCADE`)).toBe('55000');
      expect(await sqlState(`UPDATE offboarding_case_changes SET reason = 'x' WHERE case_id = $1`, [open.id])).toBe(
        '55000',
      );
      expect(await sqlState(`DELETE FROM offboarding_case_changes WHERE case_id = $1`, [open.id])).toBe('55000');
    });

    it('lets the person who left keep only the lock of the account and the closing, each written once, and the day once', async () => {
      const person = await h.worker(des, code());
      const wire = await h.recordedCase(person);
      await h.markLeft(wire.id).expect(200);

      expect(
        await sqlState(
          `UPDATE offboarding_cases SET last_working_day = '2026-12-31', departure_effective_on = '2027-01-01' WHERE id = $1`,
          [wire.id],
        ),
      ).toBe('55000');
      expect(await sqlState(`UPDATE offboarding_cases SET state = 'CANCELLED' WHERE id = $1`, [wire.id])).toBe('55000');
      await h.lockAccount(wire.id, { note: 'khóa' }).expect(200);
      expect(await sqlState(`UPDATE offboarding_cases SET account_lock_note = 'sửa' WHERE id = $1`, [wire.id])).toBe(
        '55000',
      );
      expect(await h.employeeLeftOn(person.employeeId)).toBe(h.today());
      expect(
        await sqlState(`UPDATE app_users SET employee_left_on = '2020-01-01' WHERE employee_id = $1`, [
          person.employeeId,
        ]),
      ).toBe('55000');
    });
  });

  describe('the reads', () => {
    it('lists a page and the rights of a person in a fixed number of statements, by the last working day then the id', async () => {
      const subscriptions = [
        await h.subscription(40, 'K2'),
        await h.subscription(40, 'K2'),
        await h.subscription(40, 'K2'),
      ];
      const seated = async (count: number, extra: object = {}) => {
        const employeeCode = code();
        const person = await h.worker(des, employeeCode);
        for (const subscriptionId of subscriptions.slice(0, count))
          await h.seatOf(person, { subscriptionId }, employeeCode);

        return h.recordedCase(person, extra);
      };
      const small = await seated(1);
      for (let index = 0; index < 2; index += 1) await seated(1, { lastWorkingDay: h.day(5 + index) });
      const list = await counter.run(() => h.listCases('?pageSize=100'));
      const rights = await counter.run(() => h.rightsOf(small.id, '?pageSize=100'));
      const detail = await counter.run(() => h.readCase(small.id));
      for (let index = 0; index < 6; index += 1) await seated(3, { lastWorkingDay: h.day(index) });
      const big = await seated(3);

      const largeList = await counter.run(() => h.listCases('?pageSize=100'));
      const largeRights = await counter.run(() => h.rightsOf(big.id, '?pageSize=100'));
      const largeDetail = await counter.run(() => h.readCase(big.id));

      for (const run of [list, rights, detail, largeList, largeRights, largeDetail])
        expect(run.result.status).toBe(200);
      expect(dataStatements(largeList.statements).length).toBe(dataStatements(list.statements).length);
      expect(dataStatements(largeRights.statements).length).toBe(dataStatements(rights.statements).length);
      expect(dataStatements(largeDetail.statements).length).toBe(dataStatements(detail.statements).length);
      const items = h.dataOf<{ items: CaseWire[]; pagination: { totalItems: number } }>(largeList.result).items;
      const keys = items.map((item) => `${item.lastWorkingDay}|${item.id}`);
      expect(keys).toEqual([...keys].sort());
      expect(items.find((item) => item.id === big.id)?.heldRights).toBe(3);
      expect(h.dataOf<{ items: unknown[] }>(largeRights.result).items).toHaveLength(3);
      // Nothing about a basis, a lock or a closing is read for a row of the list.
      expect(dataStatements(largeList.statements).join('\n')).not.toMatch(/grounds_|account_lock_note|head_handover/);
    });

    it('filters by state, person and what still needs a person, and pages', async () => {
      const person = await h.worker(des, code());
      const wire = await h.recordedCase(person);
      await h.markLeft(wire.id).expect(200);

      const missing = h.dataOf<{ items: CaseWire[] }>(
        await h.listCases('?accountLockMissing=true&pageSize=100').expect(200),
      ).items;
      const mine = h.dataOf<{ items: CaseWire[] }>(
        await h.listCases(`?employeeId=${person.employeeId}`).expect(200),
      ).items;
      const paged = h.dataOf<{ items: CaseWire[]; pagination: { pageSize: number; totalItems: number } }>(
        await h.listCases('?pageSize=2&page=2').expect(200),
      );

      expect(missing.map((item) => item.id)).toContain(wire.id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ state: 'LEFT', accountLockMissing: true });
      expect(paged.items.length).toBeLessThanOrEqual(2);
      expect(paged.pagination.pageSize).toBe(2);
      const unknown = await h.readCase(randomUUID());
      expect([unknown.status, h.codeOf(unknown)]).toEqual([404, 'OFFBOARDING_CASE.NOT_FOUND']);
    });
  });
});
