import type { Client } from 'pg';
import { budgetYearLockKey } from '../../../src/modules/budgets/public/budget-year-lock-key.policy';
import { waitForLockWaiters } from '../../support/lock-wait';
import { StatusHarness } from '../../support/status-harness';
import type { Unit } from '../../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.3 (F31, spec F and K): the check of the budget of a request takes the transaction
 * lock of the Cost Center and the year of every year that binds, after the lock of the row of its request and in ascending order of year,
 * and computes only after it holds them, so that two requests of one Cost Center and year are judged one after the other and the second
 * reads what the first now holds. Deterministic: a holder keeps the lock in another connection, the calls queue one by one
 * (`waitForLockWaiters`), and the holder lets them go.
 */
const h = new StatusHarness();
const M = 1_000_000;

describe('the lock of the Cost Center and the year under the check of a request (integration, real PostgreSQL)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with 40 million left of the year, and a threshold of 95 %, so that what is over what is left is the only exception. */
  const unit = async (): Promise<{ u: Unit; versionId: string }> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-LK${counter}`);
    const version = await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });

    return { u, versionId: version.id };
  };
  /** Another connection that holds the lock of the Cost Center and the year until `release`. */
  const hold = async (costCenterId: string, year: number): Promise<{ client: Client; release(): Promise<void> }> => {
    const client = await h.openClient();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      budgetYearLockKey(costCenterId, year),
    ]);

    return {
      client,
      release: async () => {
        await client.query('COMMIT');
        await client.end();
      },
    };
  };
  const checks = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ number: number; route: string }>(
        `SELECT number, route::text FROM request_budget_checks WHERE request_id = $1 ORDER BY number`,
        [requestId],
      )
    ).rows;

  it('judges two requests of one Cost Center and year one after the other: the second reads what the first now holds', async () => {
    const { u } = await unit();
    const first = await h.paidRequest(u, plan, { amount: 25 * M });
    const second = await h.paidRequest(u, plan, { amount: 25 * M });
    // Only an approval holds money (the commitment is written in the transaction of the decision, under the lock): the first is
    // checked and waits for the approver, nothing is held yet.
    await h.route(first, u.head.account);
    expect(await checks(first)).toEqual([{ number: 1, route: 'SPEND_APPROVAL' }]);
    const approver = h.deciderOf();
    const holder = await hold(u.department.unitId, h.year);
    const queued: Array<Promise<unknown>> = [];
    try {
      queued.push(h.decideSpend(first, { decision: 'APPROVE' }, approver).then((response) => response));
      await waitForLockWaiters(h.ctx.sql, 1);
      queued.push(h.route(second, u.head.account));
      await waitForLockWaiters(h.ctx.sql, 2);
      // Nothing is judged while the lock is held: both are at the lock, and neither has written a check.
      expect([await checks(first), await checks(second)]).toEqual([[{ number: 1, route: 'SPEND_APPROVAL' }], []]);
    } finally {
      await holder.release();
    }
    const [decision] = (await Promise.all(queued)) as [{ status: number }, unknown];
    expect(decision.status).toBe(200);

    // The first is approved and holds 25 of the 40 left; the second is judged after it, finds 25 of the 15 that are left and goes to Finance.
    expect(await checks(first)).toEqual([
      { number: 1, route: 'SPEND_APPROVAL' },
      { number: 2, route: 'SPEND_APPROVAL' },
    ]);
    expect(await checks(second)).toEqual([{ number: 1, route: 'FINANCE_REVIEW' }]);
    expect(await h.state(first)).toBe('AWAITING_EXECUTION');
    expect(await h.state(second)).toBe('AWAITING_FINANCE_REVIEW');
  });

  it('computes only once it holds the lock: what another transaction committed while it waited is what it judges', async () => {
    const { u, versionId } = await unit();
    const id = await h.paidRequest(u, plan, { amount: 25 * M });
    const holder = await hold(u.department.unitId, h.year);
    let routed: Promise<unknown> = Promise.resolve();
    try {
      routed = h.route(id, u.head.account);
      await waitForLockWaiters(h.ctx.sql, 1);
      // The holder spends 30 million of the year in its own transaction, which the check must see when it is let go.
      await holder.client.query(
        `INSERT INTO budget_commitments
           (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, attached_version_id, attached_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'HELD'::"CommitmentState", $7, now())`,
        [
          h.seed.organizationId,
          await h.fixtureRequestId(),
          u.department.unitId,
          h.year,
          30 * M,
          h.reporting,
          versionId,
        ],
      );
    } finally {
      await holder.release();
    }
    await routed;

    // Judged before the lock it would have been 25 of 40 and in order; judged after it is 25 of 10.
    expect(await checks(id)).toEqual([{ number: 1, route: 'FINANCE_REVIEW' }]);
  });

  it('QĐ-109: takes the lock of the year the amount is counted in, whichever year that is', async () => {
    // Rewritten from "the lock of every year that binds": a request has one year now, which may be the next.
    const { u } = await unit();
    const id = await h.paidRequest(u, plan, { amount: 10 * M });
    await h.setPayments(id, { amount: 10 * M, year: h.next });
    const holder = await hold(u.department.unitId, h.next);
    let routed: Promise<unknown> = Promise.resolve();
    try {
      routed = h.route(id, u.head.account);
      await waitForLockWaiters(h.ctx.sql, 1);
      expect(await checks(id)).toEqual([]);
    } finally {
      await holder.release();
    }
    await routed;

    expect((await checks(id)).map((check) => check.number)).toEqual([1]);
  });

  it('does not wait for the lock of another Cost Center, or of a year the request does not touch', async () => {
    const { u } = await unit();
    const { u: other } = await unit();
    const id = await h.paidRequest(u, plan, { amount: 10 * M });
    const elsewhere = await hold(other.department.unitId, h.year);
    const otherYear = await hold(u.department.unitId, h.year + 3);
    try {
      const outcome = await h.route(id, u.head.account);

      expect(outcome.status).toBe('ROUTED');
    } finally {
      await elsewhere.release();
      await otherYear.release();
    }
    expect(await checks(id)).toHaveLength(1);
  });
});
