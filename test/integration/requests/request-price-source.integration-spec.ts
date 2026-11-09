import type { Department, Person } from '../../support/request-harness';
import { declareSubscription } from '../../support/builders/catalog.builder';
import { SpendHarness } from '../../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.4 (F34, spec L.8) and `BR-MF1-07` (S1-02): a request is priced by the main subscription of
 * its plan, never by a department's, and a price of nothing is no price: the request is sent all the same, with no amount and the reason, and is
 * not checked against a budget as a request that costs 0. The IT Admin's quote that comes to nothing is incomplete, not a price.
 */
const h = new SpendHarness();

describe('what a request is priced by (integration, real PostgreSQL)', () => {
  let pricedPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    // 1 000 000 VND per seat per month, billed monthly, bought for the seeded department: the harness gives every department of the
    // suite a subscription of the same plan at the same price (the pool is shared: no department owns a copy), and a test changes the one it is about.
    pricedPlan = await h.planOf(await h.subscription(10));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const department = async (): Promise<{ department: Department; member: Person; head: Person }> => {
    counter += 1;
    const made = await h.departmentWithUnit(`P-PS${counter}`);
    const member = await h.staff(made, `PS-E${counter}`);
    const head = await h.staff(made, `PS-H${counter}`);
    await h.makeHead(made, head);

    return { department: made, member, head };
  };
  const setUnitPrice = async (departmentId: string, planId: string, amountMinor: number | null): Promise<void> => {
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET unit_price_minor = $3::bigint, unit_price_currency = CASE WHEN $3::bigint IS NULL THEN NULL ELSE 'VND' END,
              price_recorded_on = CASE WHEN $3::bigint IS NULL THEN NULL ELSE current_date END
        WHERE owner_department_id = $1 AND plan_id = $2`,
      [departmentId, planId, amountMinor],
    );
  };

  it('BR-MF1-07: prices a request by the main subscription of the plan, the same for every department: two departments, one plan, one price (S1-02)', async () => {
    // Rewritten from "by the subscription its own department owns": the pool is the plan's, so the price is too (QĐ-103d).
    const cheap = await department();
    const dear = await department();
    // A second subscription of the plan, dearer (allowed while the seat baseline is open): the pool is the plan's, no department owns a copy.
    await declareSubscription(h.ctx, h.it1.accessToken, {
      ownerDepartmentId: h.seed.departmentId,
      planId: pricedPlan,
      kind: 'TERM',
      purchasedQuantity: 5,
      unitPrice: { amount: '2500000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      startDate: '2026-01-05',
    });

    const first = await h.sent(cheap.member, pricedPlan, { termMonths: 2 });
    const second = await h.sent(dear.member, pricedPlan, { termMonths: 2 });

    // No subscription is flagged primary, so the one with the highest price a month prices the plan, whoever asks.
    for (const sent of [first, second]) {
      expect(sent.pricing).toMatchObject({
        status: 'PRICED',
        unitPrice: { amount: '2500000' },
        amount: { amount: String(2_500_000 * h.monthsOf(2)) },
      });
    }
  });

  it('BR-MF1-07: prices a request by the subscription of another department when the plan has only that one (S1-02)', async () => {
    // Rewritten from "does not price by the subscription of another department": there is no owner whose price only counts.
    const owner = await department();
    const other = await department();
    const planOfOwnerOnly = await h.planOf(await h.subscription(5, 'K2', owner.department.id));

    const priced = await h.sent(owner.member, planOfOwnerOnly, { termMonths: 1 });
    const alsoPriced = await h.sent(other.member, planOfOwnerOnly, { termMonths: 1 });

    for (const sent of [priced, alsoPriced]) {
      expect(sent.pricing).toMatchObject({ status: 'PRICED', amount: { amount: String(1_000_000 * h.monthsOf(1)) } });
    }
  });

  it('treats a price of nothing as no price: the request is sent with no amount and the reason, never as a request that costs 0', async () => {
    const owner = await department();
    const planOfFree = await h.planOf(await h.subscription(5, 'K2', owner.department.id));
    await setUnitPrice(owner.department.id, planOfFree, 0);

    const sent = await h.sent(owner.member, planOfFree, { termMonths: 3 });

    expect(sent.pricing).toMatchObject({
      status: 'MISSING',
      missingReason: 'NO_PRICED_SUBSCRIPTION',
      amount: null,
      unitPrice: null,
      months: null,
    });
    const { rows } = await h.ctx.sql.query<{ pricing_status: string; amount_minor: string | null }>(
      `SELECT pricing_status::text, amount_minor::text FROM access_requests WHERE id = $1`,
      [sent.id],
    );
    expect(rows[0]).toEqual({ pricing_status: 'MISSING', amount_minor: null });
  });

  it('does not accept a quote of nothing for a proposal: the assessment is incomplete and names the price', async () => {
    const u = await department();
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const proposed = await h.proposed(u.member);
    await h.decide(proposed.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    const quote = { ...h.assessmentBody().quote, unitPrice: { amount: '0', currency: 'VND' } };
    await h.saveAssessment(proposed.id, h.assessmentBody({ quote }), h.it1).expect(200);

    const refused = await h.completeAssessment(proposed.id, h.it1).expect(422);

    expect(h.codeOf(refused)).toBe('ASSESSMENT.INCOMPLETE');
    expect((refused.body as { error: { details: { missing: string[] } } }).error.details.missing).toContain(
      'quote.unitPrice',
    );
    expect(await h.state(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
  });
});
