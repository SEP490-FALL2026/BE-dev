import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SeatLedgerApi, seatPurchaseExpectedAmount } from '../../../src/modules/catalog/public/seat-ledger.api';
import { Barrier } from '../../support/concurrency-harness';
import { pretendBusinessToday } from '../../support/pretend-today';
import { RevocationHarness } from '../../support/revocation-harness';
import { carry, nextPeriod } from '../../support/subscription-periods';

const h = new RevocationHarness();

const isDeadlockError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } };

  return record.code === '40P01' || record.meta?.driverAdapterError?.cause?.originalCode === '40P01';
};

/**
 * Ensures a `subscription_lines` row exists for the given subscription (and plan) and opens its ledger with `INITIAL` / `RENEWAL`.
 */
async function ensureOpenedLine(input: {
  subscriptionId: string;
  effectiveOn: string;
  quantity: number;
  monthlyUnitPriceMinor: number;
  renewedFromLineId?: string | null;
  kind: 'INITIAL' | 'RENEWAL';
}): Promise<string> {
  const { rows } = await h.ctx.sql.query<{
    id: string | null;
    organization_id: string;
    workspace_id: string;
    plan_id: string;
  }>(
    `SELECT l.id, s.organization_id, s.workspace_id, s.plan_id
       FROM subscriptions s
       LEFT JOIN subscription_lines l ON l.subscription_id = s.id AND l.plan_id = s.plan_id
      WHERE s.id = $1`,
    [input.subscriptionId],
  );
  const meta = rows[0];
  let lineId = meta.id;
  if (!lineId) {
    lineId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO subscription_lines (
         id, organization_id, subscription_id, workspace_id, plan_id,
         monthly_unit_price_minor, renewed_from_line_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        lineId,
        meta.organization_id,
        input.subscriptionId,
        meta.workspace_id,
        meta.plan_id,
        input.monthlyUnitPriceMinor,
        input.renewedFromLineId ?? null,
      ],
    );
  } else {
    await h.ctx.sql.query(
      `UPDATE subscription_lines
          SET monthly_unit_price_minor = $2,
              renewed_from_line_id = COALESCE($3, renewed_from_line_id),
              updated_at = now()
        WHERE id = $1`,
      [lineId, input.monthlyUnitPriceMinor, input.renewedFromLineId ?? null],
    );
  }

  const ledger = h.ctx.app.get(SeatLedgerApi, { strict: false });
  const runner = h.ctx.app.get(TransactionRunner);
  await runner.run((tx) =>
    input.kind === 'INITIAL'
      ? ledger.openLines(tx, { lines: [{ lineId, quantity: input.quantity, effectiveOn: input.effectiveOn }] })
      : ledger.openNextPeriod(tx, {
          lines: [{ lineId, quantity: input.quantity, effectiveOn: input.effectiveOn, renewalId: null }],
        }),
  );

  return lineId;
}

/**
 * `W3-16` & `W3-18` (Q-B, real PostgreSQL):
 * 1. Granting into an open seat of the running period carries onto a pre-opened next period line that lacks capacity by recording
 *    a `MUA-...` `TOP_UP +1` row dated `nextPeriodStartDate` (`2027-07-01`, due `2027-07-07`), without raising 409.
 * 2. Concurrent carry-with-purchase and `recordVendor` on the same next period line never hit deadlock (`40P01`) across 20 runs.
 * 3. Granting with `purchase: {}` on an opened line backed by `INITIAL` writes `TOP_UP +1` + assignment cleanly with triggers active.
 */
describe('Renewal carry purchase on ledger and grant shortcut (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = () => `E-RCP-${(counter += 1)}`;
  const people: string[] = [];
  const nextPerson = (): string => {
    const id = people.shift();
    if (!id) throw new Error('Ran out of test employees');

    return id;
  };

  beforeAll(async () => {
    await h.start();
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      h.seed.departmentId,
      h.it1.employeeId,
    ]);
    for (let i = 0; i < 60; i += 1) {
      people.push(await h.person(`E-RCPX-${i}`));
    }
  }, 300000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  it('Q-B: carries into a full next-period line by buying +1 on nextPeriodStartDate (2027-07-01, due 2027-07-07, unit price 6.000.000) without 409', async () => {
    const subOld = await h.subscription(12, 'K2');
    const planId = await h.planOf(subOld);
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET billing_cycle = 'ANNUAL'::"BillingCycle",
              commitment_term_months = 12,
              start_date = '2026-07-01',
              end_date = '2027-06-30',
              unit_price_minor = 72000000,
              monthly_unit_price_minor = 6000000
        WHERE id = $1`,
      [subOld],
    );
    const lineOld = await ensureOpenedLine({
      subscriptionId: subOld,
      effectiveOn: '2026-07-01',
      quantity: 12,
      monthlyUnitPriceMinor: 6000000,
      kind: 'INITIAL',
    });

    for (let i = 0; i < 11; i += 1) {
      await h.seat({ subscriptionId: subOld }, code());
    }

    const subNext = await nextPeriod(h, subOld, 'ACTIVE', '2027-07-01');
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET workspace_id = old.workspace_id,
              end_date = '2028-06-30',
              purchased_quantity = 11,
              monthly_unit_price_minor = 6000000
         FROM subscriptions old
        WHERE subscriptions.id = $1 AND old.id = $2`,
      [subNext, subOld],
    );
    const lineNext = await ensureOpenedLine({
      subscriptionId: subNext,
      effectiveOn: '2027-07-01',
      quantity: 11,
      monthlyUnitPriceMinor: 6000000,
      renewedFromLineId: lineOld,
      kind: 'RENEWAL',
    });
    await carry(h, subOld, subNext, '2027-07-01');

    // Grant on 2027-06-20 takes the 12th free seat on lineOld, then carryOrBuy purchases +1 on lineNext for 2027-07-01.
    pretendBusinessToday(h.ctx.app, '2027-06-20');
    const beneficiaryId = nextPerson();
    const requestId = h.gate.grantable(beneficiaryId, planId);

    const granted = await h.grant({ requestId }).expect(201);
    const task = h.dataOf<{ task: { assignmentId: string; purchase: { kind: string } | null } }>(granted).task;
    expect(task.purchase).toBeNull();

    const purchases = await h.ctx.sql.query<{
      code: string;
      kind: string;
      purchased_on: string;
      quantity: number;
      invoice_obligation: string;
      invoice_due_on: string | null;
      monthly_unit_price_minor: string;
      billing_cycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null;
      renewal_date: string | null;
      end_date: string | null;
    }>(
      `SELECT sp.code, sp.kind, sp.purchased_on::text, sp.quantity, sp.invoice_obligation, sp.invoice_due_on::text,
              sl.monthly_unit_price_minor::text, s.billing_cycle::text AS billing_cycle,
              s.renewal_date::text, s.end_date::text
         FROM seat_purchases sp
         JOIN subscription_lines sl ON sl.id = sp.subscription_line_id
         JOIN subscriptions s ON s.id = sl.subscription_id
        WHERE sp.subscription_line_id = $1
        ORDER BY sp.recorded_at ASC`,
      [lineNext],
    );
    expect(purchases.rows).toHaveLength(1);
    expect(purchases.rows[0].code).toMatch(/^MUA-\d{6}$/);
    expect(purchases.rows[0].kind).toBe('TOP_UP');
    expect(purchases.rows[0].purchased_on).toBe('2027-07-01');
    expect(purchases.rows[0].quantity).toBe(1);
    expect(purchases.rows[0].invoice_obligation).toBe('WORKING_DAYS');
    expect(purchases.rows[0].invoice_due_on).toBe('2027-07-07');
    expect(
      seatPurchaseExpectedAmount({
        seats: purchases.rows[0].quantity,
        monthlyUnitPriceMinor: BigInt(purchases.rows[0].monthly_unit_price_minor),
        billingCycle: purchases.rows[0].billing_cycle,
        renewalDate: purchases.rows[0].renewal_date,
        endDate: purchases.rows[0].end_date,
        purchasedOn: purchases.rows[0].purchased_on,
      }),
    ).toBe(6_000_000n * 12n);

    const changes = await h.ctx.sql.query<{
      delta: number;
      reason: string;
      source: string;
      effective_on: string;
      request_id: string | null;
      beneficiary_employee_id: string | null;
    }>(
      `SELECT delta, reason, source, effective_on::text, request_id, beneficiary_employee_id
         FROM seat_changes
        WHERE subscription_line_id = $1 AND reason = 'TOP_UP'`,
      [lineNext],
    );
    expect(changes.rows).toEqual([
      {
        delta: 1,
        reason: 'TOP_UP',
        source: 'GRANT',
        effective_on: '2027-07-01',
        request_id: requestId,
        beneficiary_employee_id: beneficiaryId,
      },
    ]);

    const oldPurchases = await h.ctx.sql.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM seat_purchases WHERE subscription_line_id = $1`,
      [lineOld],
    );
    expect(Number(oldPurchases.rows[0].count)).toBe(0);

    const carriedSeats = await h.ctx.sql.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM license_assignments WHERE subscription_id = $1`,
      [subNext],
    );
    expect(Number(carriedSeats.rows[0].count)).toBe(12);
  });

  it('concurrency: 20 barriered carry-purchase || recordVendor runs on the same next line never hit 40P01', async () => {
    const subOld = await h.subscription(30, 'K2');
    const planId = await h.planOf(subOld);
    const startOld = h.inDays(-60);
    const startNext = h.inDays(30);
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET billing_cycle = 'ANNUAL'::"BillingCycle",
              commitment_term_months = 12,
              start_date = $2::date,
              end_date = ($3::date - 1),
              monthly_unit_price_minor = 1000000
        WHERE id = $1`,
      [subOld, startOld, startNext],
    );
    const lineOld = await ensureOpenedLine({
      subscriptionId: subOld,
      effectiveOn: startOld,
      quantity: 30,
      monthlyUnitPriceMinor: 1000000,
      kind: 'INITIAL',
    });

    const subNext = await nextPeriod(h, subOld, 'ACTIVE', startNext);
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET workspace_id = old.workspace_id,
              end_date = ($3::date + 364),
              purchased_quantity = 0,
              monthly_unit_price_minor = 1000000
         FROM subscriptions old
        WHERE subscriptions.id = $1 AND old.id = $2`,
      [subNext, subOld, startNext],
    );
    const lineNext = await ensureOpenedLine({
      subscriptionId: subNext,
      effectiveOn: startNext,
      quantity: 0,
      monthlyUnitPriceMinor: 1000000,
      renewedFromLineId: lineOld,
      kind: 'RENEWAL',
    });

    const runner = h.ctx.app.get(TransactionRunner);
    const ledger = h.ctx.app.get(SeatLedgerApi, { strict: false });
    const actor = h.actorOf(h.it1);

    for (let i = 0; i < 20; i += 1) {
      const requestId = h.gate.grantable(nextPerson(), planId);
      const barrier = new Barrier(2);

      const grantCarry = (async () => {
        await barrier.wait();
        return h.grant({ requestId });
      })();

      const vendorStep = (async () => {
        await barrier.wait();
        return runner.run((tx) =>
          ledger.recordVendor(tx, lineNext, {
            delta: 1,
            effectiveOn: startNext,
            note: `vendor sync ${i}`,
            actor,
            checkClosedMonth: false,
          }),
        );
      })();

      const [grantResult, vendorResult] = await Promise.allSettled([grantCarry, vendorStep]);
      expect(grantResult.status).toBe('fulfilled');
      if (grantResult.status === 'rejected') {
        expect(isDeadlockError(grantResult.reason)).toBe(false);
      }
      expect(vendorResult.status).toBe('fulfilled');
      if (vendorResult.status === 'rejected') {
        expect(isDeadlockError(vendorResult.reason)).toBe(false);
      }
    }
  });

  it('W3-18: grant with purchase on a backfilled/opened INITIAL line writes TOP_UP +1 and passes DB capacity triggers', async () => {
    const subId = await h.subscription(1, 'K2');
    const planId = await h.planOf(subId);
    const openedOn = h.inDays(-10);
    await h.ctx.sql.query(`UPDATE subscriptions SET start_date = $2::date WHERE id = $1`, [subId, openedOn]);
    const lineId = await ensureOpenedLine({
      subscriptionId: subId,
      effectiveOn: openedOn,
      quantity: 1,
      monthlyUnitPriceMinor: 1000000,
      kind: 'INITIAL',
    });
    await h.seat({ subscriptionId: subId }, code());

    const beneficiaryId = nextPerson();
    const requestId = h.gate.grantable(beneficiaryId, planId);
    const res = await h.grant({ requestId, purchase: {} }).expect(201);
    const task = h.dataOf<{ task: { assignmentId: string; purchase: { kind: string } | null } }>(res).task;

    expect(task.purchase).toMatchObject({ kind: 'POOL_TOP_UP' });

    const ledgerRows = await h.ctx.sql.query<{ reason: string; delta: number; source: string }>(
      `SELECT reason, delta, source FROM seat_changes WHERE subscription_line_id = $1 ORDER BY recorded_at ASC`,
      [lineId],
    );
    expect(ledgerRows.rows).toEqual([
      { reason: 'INITIAL', delta: 1, source: 'ADJUSTMENT' },
      { reason: 'TOP_UP', delta: 1, source: 'GRANT' },
    ]);

    const purchaseRows = await h.ctx.sql.query<{ code: string; kind: string; quantity: number }>(
      `SELECT code, kind, quantity FROM seat_purchases WHERE subscription_line_id = $1`,
      [lineId],
    );
    expect(purchaseRows.rows).toHaveLength(1);
    expect(purchaseRows.rows[0].code).toMatch(/^MUA-\d{6}$/);
    expect(purchaseRows.rows[0]).toMatchObject({ kind: 'TOP_UP', quantity: 1 });
  });

  it('F-5: IT Admin other than subscription responsible granting with purchase emits SUBSCRIPTION_SEATS_BOUGHT to R1', async () => {
    const subId = await h.subscription(1, 'K2');
    const planId = await h.planOf(subId);
    const openedOn = h.inDays(-10);
    await h.ctx.sql.query(`UPDATE subscriptions SET start_date = $2::date WHERE id = $1`, [subId, openedOn]);
    await ensureOpenedLine({
      subscriptionId: subId,
      effectiveOn: openedOn,
      quantity: 1,
      monthlyUnitPriceMinor: 1000000,
      kind: 'INITIAL',
    });
    await h.seat({ subscriptionId: subId }, code());

    const it2Emp = await h.person('E-IT2-F5');
    const it2 = await h.account('E-IT2-F5', it2Emp, 'IT_ADMIN');
    const dept = await h.department('D-F5', it2Emp);
    const beneficiaryId = await h.member(dept.code, 'M-F5', 'Designer');
    const requestId = h.gate.grantable(beneficiaryId, planId, dept.id);

    await h.grant({ requestId, purchase: {} }, it2).expect(201);

    const { rows } = await h.ctx.sql.query<{ recipient_employee_id: string; code: string; subject_id: string }>(
      `SELECT recipient_employee_id, code::text, subject_id
         FROM notifications
        WHERE subject_id = $1 AND code = 'SUBSCRIPTION_SEATS_BOUGHT'`,
      [subId],
    );
    expect(rows).toEqual([
      {
        recipient_employee_id: h.it1.employeeId,
        code: 'SUBSCRIPTION_SEATS_BOUGHT',
        subject_id: subId,
      },
    ]);
  });
});
