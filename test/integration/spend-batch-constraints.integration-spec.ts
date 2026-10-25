import { randomUUID } from 'node:crypto';
import { SpendHarness, Unit } from '../support/spend-harness';

const h = new SpendHarness();
const CHECK = '23514';
const UNIQUE = '23505';
const RESTRICT = '23001';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('batches and supplementary files (integration, PostgreSQL constraints)', () => {
  let unit: Unit;
  let plan: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    unit = await h.departmentWithHead('P-BC');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const batch = async (): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO spend_batches (id, organization_id, department_id, submitted_by_employee_id)
         VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
        [h.seed.organizationId, unit.department.id, unit.head.employeeId],
      )
    ).rows[0].id;
  const request = () => h.paidRequest(unit, plan, { amount: 1_000_000 });
  const item = async (batchId: string, requestId: string, over: Record<string, unknown> = {}) => {
    const row = { batch_id: batchId, request_id: requestId, position: 1, outcome: 'SENT_TO_APPROVER', ...over };
    const columns = Object.keys(row);

    return sqlState(
      `INSERT INTO spend_batch_items (${columns.join(', ')})
       VALUES (${columns
         .map(
           (column, index) =>
             `$${index + 1}${column === 'outcome' ? '::"SpendBatchItemOutcome"' : column === 'left_reason' ? '::"SpendBatchLeftReason"' : ''}`,
         )
         .join(', ')})`,
      columns.map((column) => (row as Record<string, unknown>)[column]),
    );
  };

  describe('the items of a batch (US-06-14 AC-3, AC-9)', () => {
    it('takes a request that was sent, one that stayed with its reason, and one that was sent and left', async () => {
      const id = await batch();

      expect(await item(id, await request(), { position: 1 })).toBeNull();
      expect(
        await item(id, await request(), { position: 2, outcome: 'STOPPED', stop_reason: 'STALE_COST_EVIDENCE' }),
      ).toBeNull();
      expect(
        await item(id, await request(), {
          position: 3,
          outcome: 'SENT_TO_FINANCE',
          left_reason: 'RETURNED_BY_FINANCE',
          left_at: new Date(),
        }),
      ).toBeNull();
    });

    it.each([
      ['one that stayed and says no reason', { outcome: 'STOPPED' }],
      ['one that stayed with a reason nobody knows', { outcome: 'STOPPED', stop_reason: 'BECAUSE' }],
      ['one that was sent and gives a reason it stayed', { stop_reason: 'STALE_COST_EVIDENCE' }],
      ['one that left and says no time', { left_reason: 'CONFLICT_OF_INTEREST' }],
      ['one that has a time of leaving and no reason', { left_at: new Date() }],
      [
        'one that stayed and also left',
        { outcome: 'STOPPED', stop_reason: 'PRICE_MISSING', left_reason: 'RETURNED_BY_FINANCE', left_at: new Date() },
      ],
      ['a position of nothing', { position: 0 }],
    ])('refuses %s', async (_name, over) => {
      expect(await item(await batch(), await request(), over)).toBe(CHECK);
    });

    it('takes a request once in a batch and a position once', async () => {
      const id = await batch();
      const first = await request();
      await item(id, first, { position: 1 });

      expect(await item(id, first, { position: 2 })).toBe(UNIQUE);
      expect(await item(id, await request(), { position: 1 })).toBe(UNIQUE);
    });

    it('says once that a request left, and keeps everything else it said', async () => {
      const id = await batch();
      const requestId = await request();
      await item(id, requestId);

      expect(
        await sqlState(
          `UPDATE spend_batch_items SET left_reason = 'RETURNED_BY_FINANCE'::"SpendBatchLeftReason", left_at = now() WHERE batch_id = $1`,
          [id],
        ),
      ).toBeNull();
      expect(
        await sqlState(
          `UPDATE spend_batch_items SET left_reason = 'CONFLICT_OF_INTEREST'::"SpendBatchLeftReason" WHERE batch_id = $1`,
          [id],
        ),
      ).toBe(RESTRICT);
      expect(
        await sqlState(
          `UPDATE spend_batch_items SET outcome = 'STOPPED'::"SpendBatchItemOutcome" WHERE batch_id = $1`,
          [id],
        ),
      ).toBe(RESTRICT);
      expect(await sqlState(`UPDATE spend_batch_items SET position = 9 WHERE batch_id = $1`, [id])).toBe(RESTRICT);
    });

    it('is never deleted or truncated', async () => {
      const id = await batch();
      await item(id, await request());

      expect(await sqlState(`DELETE FROM spend_batch_items WHERE batch_id = $1`, [id])).toBe(RESTRICT);
      expect(await sqlState(`TRUNCATE spend_batch_items`)).toBe(RESTRICT);
    });
  });

  describe('a batch (QĐ-82j)', () => {
    it('is never changed or deleted: who sent it and when stay as they were', async () => {
      const id = await batch();

      expect(await sqlState(`UPDATE spend_batches SET submitted_at = now() WHERE id = $1`, [id])).toBe(RESTRICT);
      expect(await sqlState(`DELETE FROM spend_batches WHERE id = $1`, [id])).toBe(RESTRICT);
      expect(await sqlState(`TRUNCATE spend_batches CASCADE`)).toBe(RESTRICT);
    });

    it('is sent by someone who exists, for a department that exists', async () => {
      const insert = (department: string, employee: string) =>
        sqlState(
          `INSERT INTO spend_batches (id, organization_id, department_id, submitted_by_employee_id) VALUES (gen_random_uuid(), $1, $2, $3)`,
          [h.seed.organizationId, department, employee],
        );

      expect(await insert(randomUUID(), unit.head.employeeId)).toBe('23503');
      expect(await insert(unit.department.id, randomUUID())).toBe('23503');
    });
  });

  describe('a supplementary file (QĐ-82n)', () => {
    const supplement = async (over: Record<string, unknown> = {}) => {
      const row = {
        id: randomUUID(),
        organization_id: h.seed.organizationId,
        request_id: await request(),
        number: 1,
        reason: 'The purchase moved',
        changed_by_employee_id: unit.head.employeeId,
        before_expected_spend_on: '2026-12-20',
        after_expected_spend_on: '2027-01-15',
        before_budget_year: 2026,
        after_budget_year: 2027,
        before_amount_minor: 100,
        after_amount_minor: 200,
        currency: 'VND',
        ...over,
      };
      const columns = Object.keys(row);
      const state = await sqlState(
        `INSERT INTO request_supplements (${columns.join(', ')}) VALUES (${columns.map((_column, index) => `$${index + 1}`).join(', ')})`,
        columns.map((column) => (row as Record<string, unknown>)[column]),
      );

      return { state, row };
    };

    it('takes a change of day with its reason and what it cost before and after', async () => {
      expect((await supplement()).state).toBeNull();
    });

    it.each([
      ['no reason', { reason: ' ' }],
      ['the same day and the same cost', { after_expected_spend_on: '2026-12-20', after_amount_minor: 100 }],
      ['a cost below nothing', { before_amount_minor: -1 }],
      ['a number of nothing', { number: 0 }],
    ])('refuses %s', async (_name, over) => {
      expect((await supplement(over)).state).toBe(CHECK);
    });

    it('takes one file of a number for a request, and is never changed or deleted', async () => {
      const first = await supplement();

      expect(await supplement({ request_id: first.row.request_id })).toMatchObject({ state: UNIQUE });
      expect(await sqlState(`UPDATE request_supplements SET reason = 'x' WHERE id = $1`, [first.row.id])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`DELETE FROM request_supplements WHERE id = $1`, [first.row.id])).toBe(RESTRICT);
      // The files of the people left out of a group refer to it, so the database refuses to empty it at all (`0A000`).
      expect(await sqlState(`TRUNCATE request_supplements`)).toBe('0A000');
    });
  });
});
