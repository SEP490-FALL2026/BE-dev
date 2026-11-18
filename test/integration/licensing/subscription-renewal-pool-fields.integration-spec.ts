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
    purchasedQuantity: 5,
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
  /**
   * A term of the unit at its point of adjustment, two people holding a seat; `settings` is written on the old period by SQL, as the pool
   * fields were before. The vendor sells nothing under five seats, so the result recorded is the raise to them, with its evidence.
   */
  const period = async (settings: { primary: boolean; billingCycle?: 'MONTHLY' | 'ANNUAL' }) => {
    const unit = await h.unit(2);
    const monthly = settings.billingCycle === 'MONTHLY';
    // A plan by the month is paid on a day 5 days away, so today is inside the 7 days of its point of adjustment.
    const subscriptionId = monthly
      ? await h.term({
          quantity: 3,
          billingCycle: 'MONTHLY',
          startDate: h.inDays(-25),
          renewalDate: h.inDays(5),
          endDate: h.inDays(5),
          autoRenew: true,
        })
      : (await h.termWithSeats(unit, 20, { quantity: 3, ...year() })).subscriptionId;
    if (monthly) for (const member of unit.members) await h.seatOf(member, { subscriptionId });
    await h.ctx.sql.query(`UPDATE subscriptions SET vendor_minimum_seats = 5, is_primary_for_plan = $2 WHERE id = $1`, [
      subscriptionId,
      settings.primary,
    ]);

    return subscriptionId;
  };
  const body = (subscriptionId: string, nextPeriod: object) => ({
    subscriptionId,
    choice: 'INCREASE',
    proposedQuantity: 5,
    note: 'The vendor sells nothing under five seats (contract 4.2).',
    outcome: 'AS_DECIDED',
    nextPeriod,
  });

  it('copies the commitment, the IT Admin and the vendor minimum, and moves the flag that prices the plan, recording the move (F-003, F-005)', async () => {
    const subscriptionId = await period({ primary: true });
    const before = await rowOf(subscriptionId);
    expect(before).toMatchObject({ commitment: 12, minimum: 5, primary: true });

    const { nextSubscriptionId: next } = await h.recordedRenewal(body(subscriptionId, nextYear('ANNUAL')));

    expect(await rowOf(next as string)).toMatchObject({
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
    const subscriptionId = await period({ primary: false });

    const { nextSubscriptionId: next } = await h.recordedRenewal(body(subscriptionId, nextYear('ANNUAL')));

    expect(await rowOf(next as string)).toMatchObject({ commitment: 12, minimum: 5, primary: false });
    expect((await rowOf(subscriptionId)).primary).toBe(false);
  });

  it('QĐ-111an: refuses a new period priced in another currency: 409 PERIOD_REFUSED with the reason PRICE_NOT_VND, nothing written, no case kept, and the same write goes through in dong', async () => {
    const subscriptionId = await period({ primary: false });
    const periods = await h.count('subscriptions');
    const cases = await h.count('subscription_renewals');

    const response = await h.propose(
      body(subscriptionId, { ...nextYear('ANNUAL'), unitPrice: { amount: '40.00', currency: 'USD' } }),
    );

    expect(response.status).toBe(409);
    expect(h.codeOf(response)).toBe('SUBSCRIPTION_RENEWAL.PERIOD_REFUSED');
    expect(h.detailsOf(response)).toEqual({ reason: 'PRICE_NOT_VND' });
    expect(await h.count('subscriptions')).toBe(periods);
    // The case is written with its outcome in one transaction: the refusal leaves nothing, so the IT Admin writes again.
    expect(await h.count('subscription_renewals')).toBe(cases);
    await h.propose(body(subscriptionId, nextYear('ANNUAL'))).expect(201);
  });

  it('refuses a new period paid by the year when the commitment it inherits is one month (R-G01, F-002), and writes nothing', async () => {
    const subscriptionId = await period({ primary: false, billingCycle: 'MONTHLY' });
    expect(await rowOf(subscriptionId)).toMatchObject({ commitment: 1 });
    const periods = await h.count('subscriptions');
    const cases = await h.count('subscription_renewals');

    const response = await h.propose(
      body(subscriptionId, { ...nextYear('ANNUAL'), startDate: h.inDays(5), endDate: h.inDays(369) }),
    );

    expect(h.codeOf(response)).toBe('SUBSCRIPTION_RENEWAL.PERIOD_REFUSED');
    expect(h.detailsOf(response)).toEqual({ reason: 'INVALID_TERMS' });
    expect(await h.count('subscriptions')).toBe(periods);
    expect(await h.count('subscription_renewals')).toBe(cases);
  });
});
