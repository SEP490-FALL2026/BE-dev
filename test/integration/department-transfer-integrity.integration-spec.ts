import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { PgRelay } from '../support/pg-relay';
import { QueryCounter, dataStatements } from '../support/query-count';
import { TransferHarness, type TransferWire } from '../support/transfer-harness';
import type { Department } from '../support/request-harness';

const h = new TransferHarness();

/** US-03-01 (INV-20): what the database refuses, and the shape of the list. */
describe('the history of a person and the list of transfers (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Department;
  let fin: Department;
  let sequence = 0;
  const code = (prefix: string) => `${prefix}${(sequence += 1)}`;
  const body = (employeeId: string, extra: object = {}) => ({
    employeeId,
    toDepartmentId: fin.id,
    effectiveOn: h.day(30),
    grounds: h.grounds,
    ...extra,
  });
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
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('a placement that has been told is history (INV-20)', () => {
    it('never changes the person, the department or the title of any placement, and never moves or loses a told one', async () => {
      const person = await h.veteran(des, code('E'));
      const wire = await h.recorded(body(person.employeeId, { effectiveOn: h.today() }));
      const [closed, opened] = await h.placements(person.employeeId);
      await h.sweepAt();

      expect(
        await sqlState(`UPDATE employee_placements SET department_id = $2 WHERE id = $1`, [closed.id, fin.id]),
      ).toBe('55000');
      expect(
        await sqlState(`UPDATE employee_placements SET job_title_id = $2 WHERE id = $1`, [opened.id, randomUUID()]),
      ).toBe('55000');
      expect(
        await sqlState(`UPDATE employee_placements SET valid_from = valid_from + 1 WHERE id = $1`, [opened.id]),
      ).toBe('55000');
      expect(await sqlState(`DELETE FROM employee_placements WHERE id = $1`, [opened.id])).toBe('55000');
      // The placement the transfer ended is kept too, once the transfer took effect.
      expect(await sqlState(`DELETE FROM employee_placements WHERE id = $1`, [closed.id])).toBe('55000');
      expect(wire.status).toBe('EFFECTIVE');
      expect(await h.placements(person.employeeId)).toHaveLength(2);
    });

    it('may still remove or move a placement dated for a day to come that was never told (what moving a transfer does)', async () => {
      const person = await h.veteran(des, code('E'));
      await h.recorded(body(person.employeeId));
      const [, future] = await h.placements(person.employeeId);

      expect(
        await sqlState(`UPDATE employee_placements SET valid_from = valid_from + 1 WHERE id = $1`, [future.id]),
      ).toBeNull();
    });
  });

  describe('the state of work of an employee (FR-2.13)', () => {
    const state = async (employeeId: string) =>
      (await h.ctx.sql.query<{ s: string }>(`SELECT work_state::text AS s FROM employees WHERE id = $1`, [employeeId]))
        .rows[0].s;
    const move = (employeeId: string, to: string) =>
      sqlState(`UPDATE employees SET work_state = $2::"EmployeeWorkState" WHERE id = $1`, [employeeId, to]);
    const runner = () => h.ctx.app.get(TransactionRunner, { strict: false });

    it('follows the graph: long leave and back, handing over and back, and nothing else by itself', async () => {
      const person = await h.veteran(des, code('E'));

      expect(await state(person.employeeId)).toBe('WORKING');
      expect(await move(person.employeeId, 'ON_LONG_LEAVE')).toBeNull();
      expect(await move(person.employeeId, 'HANDING_OVER')).toBeNull();
      expect(await move(person.employeeId, 'WORKING')).toBeNull();
      // Leaving is the status: the work state alone cannot say it, and says it itself when the status does.
      expect(await move(person.employeeId, 'LEFT')).toBe('23514');
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [person.employeeId]);
      expect(await state(person.employeeId)).toBe('LEFT');
      expect(await move(person.employeeId, 'WORKING')).toBe('23514');
    });

    it('is written through the organization, and the database refuses a step off the graph', async () => {
      const person = await h.veteran(des, code('E'));
      const set = (to: 'WORKING' | 'ON_LONG_LEAVE' | 'HANDING_OVER' | 'LEFT') =>
        runner().run(async (tx) => {
          await h.organizationService().lockEmployeeForUpdate(tx, person.employeeId);
          await h.history().setEmployeeWorkState(tx, person.employeeId, to);
        });

      await set('ON_LONG_LEAVE');
      expect(await state(person.employeeId)).toBe('ON_LONG_LEAVE');
      expect((await h.organizationService().getEmployee(person.employeeId))?.workState).toBe('ON_LONG_LEAVE');
      await expect(set('LEFT')).rejects.toBeDefined();
      expect(await state(person.employeeId)).toBe('ON_LONG_LEAVE');
    });

    it('lets a person on a long leave be moved, and refuses one who is handing over before leaving', async () => {
      const onLeave = await h.veteran(des, code('E'));
      const handing = await h.veteran(des, code('E'));
      await move(onLeave.employeeId, 'ON_LONG_LEAVE');
      await move(handing.employeeId, 'HANDING_OVER');

      await h.recorded(body(onLeave.employeeId));
      const refused = await h.recordTransfer(body(handing.employeeId));

      expect([refused.status, h.codeOf(refused)]).toEqual([409, 'DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS']);
      expect(h.detailsOf(refused)).toEqual({ kind: 'OFFBOARDING' });
    });
  });

  describe('what the transfer keeps', () => {
    it('is never deleted nor rewritten once it has taken effect or was cancelled, and its log only grows', async () => {
      const person = await h.veteran(des, code('E'));
      const done = await h.recorded(body(person.employeeId, { effectiveOn: h.today() }));
      const other = await h.recorded(body((await h.veteran(des, code('E'))).employeeId));
      await h.cancelTransfer(other.id, { reason: 'Not needed', grounds: h.grounds }).expect(200);

      expect(await sqlState(`DELETE FROM department_transfers WHERE id = $1`, [done.id])).toBe('23001');
      expect(
        await sqlState(`UPDATE department_transfers SET effective_on = effective_on + 1 WHERE id = $1`, [done.id]),
      ).toBe('23001');
      expect(await sqlState(`UPDATE department_transfers SET cancelled_reason = 'x' WHERE id = $1`, [other.id])).toBe(
        '23001',
      );
      expect(
        await sqlState(`UPDATE department_transfer_changes SET reason = 'x' WHERE transfer_id = $1`, [other.id]),
      ).toBe('23001');
      expect(await sqlState(`DELETE FROM department_transfer_changes WHERE transfer_id = $1`, [other.id])).toBe(
        '23001',
      );
      expect(await sqlState(`TRUNCATE department_transfers CASCADE`)).toBe('23001');
    });

    it('says a cancelled transfer is cancelled with who, when and why, and a waiting one is none of that', async () => {
      const waiting = await h.recorded(body((await h.veteran(des, code('E'))).employeeId));

      expect(await sqlState(`UPDATE department_transfers SET status = 'CANCELLED' WHERE id = $1`, [waiting.id])).toBe(
        '23514',
      );
      expect(await sqlState(`UPDATE department_transfers SET status = 'EFFECTIVE' WHERE id = $1`, [waiting.id])).toBe(
        '23514',
      );
      expect(
        await sqlState(`UPDATE department_transfers SET employee_id = $2 WHERE id = $1`, [
          waiting.id,
          h.it1.employeeId,
        ]),
      ).toBe('23001');
    });

    it('tells each placement, head period and person once per kind', async () => {
      const [row] = await h.announcements();
      const fault = await sqlState(
        `INSERT INTO organization_change_announcements (id, organization_id, kind, subject_id, effective_on)
         VALUES (gen_random_uuid(), $1, $2::"OrganizationChangeKind", $3, current_date)`,
        [h.seed.organizationId, row.kind, row.subject_id],
      );

      expect(fault).toBe('23505');
    });
  });

  describe('the list (API-LIST-DETAIL)', () => {
    it('reads a page in a fixed number of statements, newest day first then id, without the basis or the handover', async () => {
      const first: TransferWire[] = [];
      for (let index = 0; index < 3; index += 1) {
        first.push(
          await h.recorded(body((await h.veteran(des, code('L'))).employeeId, { effectiveOn: h.day(100 + index) })),
        );
      }
      const small = await counter.run(() => h.listTransfers('?pageSize=100'));
      for (let index = 0; index < 9; index += 1) {
        await h.recorded(body((await h.veteran(des, code('L'))).employeeId, { effectiveOn: h.day(100 + (index % 4)) }));
      }

      const large = await counter.run(() => h.listTransfers('?pageSize=100'));

      expect(small.result.status).toBe(200);
      expect(large.result.status).toBe(200);
      const count = (statements: string[]) => dataStatements(statements).length;
      expect(count(large.statements)).toBe(count(small.statements));
      const read = dataStatements(large.statements).join('\n');
      expect(read).not.toMatch(/grounds_|head_handover|recorded_by_app_user_id|cancelled_reason/);
      const items = h.dataOf<{ items: TransferWire[]; pagination: { totalItems: number } }>(large.result).items;
      const ordered = [...items].sort((a, b) =>
        a.effectiveOn === b.effectiveOn ? (a.id < b.id ? -1 : 1) : a.effectiveOn < b.effectiveOn ? 1 : -1,
      );
      expect(items.map((item) => item.id)).toEqual(ordered.map((item) => item.id));
      expect(items.length).toBeGreaterThanOrEqual(12);
      expect(items[0]).not.toHaveProperty('grounds');
      expect(first).toHaveLength(3);
    });

    it('filters by person, state and days, and pages with a total that matches the page', async () => {
      const person = await h.veteran(des, code('F'));
      const wire = await h.recorded(body(person.employeeId, { effectiveOn: h.day(200) }));

      const byPerson = h.dataOf<{ items: TransferWire[]; pagination: { totalItems: number; totalPages: number } }>(
        await h
          .listTransfers(
            `?employeeId=${person.employeeId}&status=PENDING&effectiveFrom=${h.day(199)}&effectiveTo=${h.day(201)}`,
          )
          .expect(200),
      );
      const none = h.dataOf<{ items: TransferWire[] }>(
        await h.listTransfers(`?employeeId=${person.employeeId}&status=CANCELLED`).expect(200),
      );
      const paged = h.dataOf<{
        items: TransferWire[];
        pagination: { page: number; pageSize: number; totalItems: number };
      }>(await h.listTransfers('?pageSize=2&page=2').expect(200));

      expect(byPerson.items.map((item) => item.id)).toEqual([wire.id]);
      expect(byPerson.pagination).toMatchObject({ totalItems: 1, totalPages: 1 });
      expect(none.items).toEqual([]);
      expect(paged.items).toHaveLength(2);
      expect(paged.pagination).toMatchObject({ page: 2, pageSize: 2 });
      expect(paged.pagination.totalItems).toBeGreaterThan(4);
    });
  });
});
