import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

interface PeriodRow {
  id: string;
  commitment: number | null;
  responsible: string | null;
  minimum: number | null;
  primary: boolean;
}

/**
 * QĐ-103e on the chain of periods (`QĐ-16`): the period a renewal records inherits what the shared pool made the old one hold, and
 * the flag that prices the plan moves to it; and it meets the same commitment-and-cycle rules as a new write.
 */
describe('the pool fields of the period a renewal records (integration, real PostgreSQL)', () => {
  const year = () => ({ startDate: h.inDays(-300), endDate: h.inDays(64) });
  const nextYear = (billingCycle: string) => ({
    purchasedQuantity: 10,
    unitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle,
    startDate: h.inDays(65),
    endDate: h.inDays(429),
    noticeDeadline: h.inDays(400),
    autoRenew: true,
    allowsMidTermReduction: false,
  });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const rowOf = async (id: string) =>
    (
      await h.ctx.sql.query<PeriodRow>(
        `SELECT id, commitment_term_months AS commitment, responsible_it_admin_employee_id AS responsible,
                vendor_minimum_seats AS minimum, is_primary_for_plan AS "primary" FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0];
  /** A decided renewal of a term of the unit; `settings` is written on the old period by SQL, as the pool fields were before. */
  const decidedRenewal = async (settings: { primary: boolean; billingCycle?: 'MONTHLY' | 'ANNUAL' }) => {
    const unit = await h.unit(2);
    const { subscriptionId } = await h.termWithSeats(unit, 20, {
      quantity: 10,
      ...year(),
      ...(settings.billingCycle ? { billingCycle: settings.billingCycle } : {}),
    });
    await h.ctx.sql.query(`UPDATE subscriptions SET vendor_minimum_seats = 5, is_primary_for_plan = $2 WHERE id = $1`, [
      subscriptionId,
      settings.primary,
    ]);
    const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });
    await h.confirmRenewal(id, unit.head.account).expect(200);

    return { subscriptionId, id };
  };

  it('copies the commitment, the IT Admin and the vendor minimum, and moves the flag that prices the plan, recording the move (F-003, F-005)', async () => {
    const { subscriptionId, id } = await decidedRenewal({ primary: true });
    const before = await rowOf(subscriptionId);
    expect(before).toMatchObject({ commitment: 12, minimum: 5, primary: true });

    const response = await h.outcome(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear('ANNUAL') }).expect(200);

    const next = h.dataOf<{ renewal: { outcomeDetail: { nextSubscriptionId: string } } }>(response).renewal
      .outcomeDetail.nextSubscriptionId;
    expect(await rowOf(next)).toMatchObject({
      commitment: 12,
      responsible: before.responsible,
      minimum: 5,
      primary: true,
    });
    expect((await rowOf(subscriptionId)).primary).toBe(false);
    const released = (await h.auditOf('Subscription', subscriptionId)).find(
      (event) => event.action === 'SUBSCRIPTION.UPDATED',
    );
    expect(released).toMatchObject({ before: { isPrimaryForPlan: true }, after: { isPrimaryForPlan: false } });
  });

  it('leaves a new period without the flag when the old one had none', async () => {
    const { subscriptionId, id } = await decidedRenewal({ primary: false });

    const response = await h.outcome(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear('ANNUAL') }).expect(200);

    const next = h.dataOf<{ renewal: { outcomeDetail: { nextSubscriptionId: string } } }>(response).renewal
      .outcomeDetail.nextSubscriptionId;
    expect(await rowOf(next)).toMatchObject({ commitment: 12, minimum: 5, primary: false });
    expect((await rowOf(subscriptionId)).primary).toBe(false);
  });

  it('refuses a new period paid by the year when the commitment it inherits is one month (R-G01, F-002), and writes nothing', async () => {
    const { subscriptionId, id } = await decidedRenewal({ primary: false, billingCycle: 'MONTHLY' });
    expect(await rowOf(subscriptionId)).toMatchObject({ commitment: 1 });
    const periods = await h.count('subscriptions');

    const response = await h.outcome(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear('ANNUAL') });

    expect(h.codeOf(response)).toBe('SUBSCRIPTION_RENEWAL.PERIOD_REFUSED');
    expect(h.detailsOf(response)).toEqual({ reason: 'INVALID_TERMS' });
    expect(await h.count('subscriptions')).toBe(periods);
  });
});
