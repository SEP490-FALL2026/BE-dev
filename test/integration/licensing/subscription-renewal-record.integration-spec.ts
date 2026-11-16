import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

interface CaseWire {
  id: string;
  state: string;
  decision: { deciderRole: string } | null;
  outcomeDetail: { kind: string; nextSubscriptionId: string | null } | null;
}

/**
 * The result of the adjustment of a subscription recorded in one write (`SBF-20` §4.4, S20-T4a), on real PostgreSQL: the case, its
 * decision by the IT Admin in charge and its outcome in ONE transaction, the seats the system counts, who is told and who stands in. A
 * K2 workspace a department owns keeps its point of adjustment; the point of an annual term is 30 days before its deadline.
 */
describe('the one-write renewal at the point of adjustment (integration, real PostgreSQL)', () => {
  const year = () => ({ startDate: h.inDays(-300), endDate: h.inDays(64) });
  const nextYear = (quantity: number) => ({
    purchasedQuantity: quantity,
    unitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle: 'ANNUAL',
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

  const record = (body: Record<string, unknown>, account = h.it1) => h.propose(body, account);
  const detailsOf = (response: { body: unknown }) =>
    (response.body as { error: { details?: Record<string, unknown> } }).error.details;

  it('records the reduction to the seats counted as decided, the IT Admin deciding alone, nobody else asked (§4.4 steps 8-9)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId, seats } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    const commitmentsBefore = await h.count('budget_commitments');

    const response = await record({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
      outcome: 'AS_DECIDED',
      nextPeriod: nextYear(2),
    });

    expect(response.status).toBe(201);
    const renewal = h.dataOf<{ renewal: CaseWire }>(response).renewal;
    expect(renewal).toMatchObject({
      state: 'OUTCOME_RECORDED',
      decision: { deciderRole: 'IT_ADMIN_IN_CHARGE' },
      outcomeDetail: { kind: 'AS_DECIDED' },
    });
    // The count is written with the case; the wire shows it with the contract of the route (S20-T4b).
    const { rows: counted } = await h.ctx.sql.query<{ seats_needed: number }>(
      `SELECT seats_needed FROM subscription_renewals WHERE id = $1`,
      [renewal.id],
    );
    expect(counted[0].seats_needed).toBe(2);
    const next = renewal.outcomeDetail?.nextSubscriptionId as string;
    const { rows: carried } = await h.ctx.sql.query<{ predecessor_id: string }>(
      `SELECT predecessor_id FROM license_assignments WHERE subscription_id = $1 AND source = 'RENEWAL_CARRY'`,
      [next],
    );
    expect(carried.map((row) => row.predecessor_id).sort()).toEqual([...seats].sort());
    // No head, no spending approver, no revocation, no commitment: the case never waited for anybody.
    expect(await h.notices('SUBSCRIPTION_RENEWAL_PROPOSED', renewal.id)).toEqual([]);
    expect(await h.revocationReasons(seats)).toEqual([]);
    expect(await h.count('budget_commitments')).toBe(commitmentsBefore);
    expect(await h.caseRow(renewal.id)).toMatchObject({
      state: 'OUTCOME_RECORDED',
      decider_role: 'IT_ADMIN_IN_CHARGE',
    });
    const audit = await h.auditOf('SubscriptionRenewal', renewal.id);
    expect(audit.map((event) => event.action)).toEqual(
      expect.arrayContaining(['SUBSCRIPTION_RENEWAL.PROPOSED', 'SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED']),
    );
    expect(audit.find((event) => event.action === 'SUBSCRIPTION_RENEWAL.PROPOSED')?.after).toMatchObject({
      seatsNeeded: 2,
      heldPastRenewal: 2,
      substitute: false,
    });
    // One live case per period, and the period now has its successor.
    const again = await record({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
      outcome: 'AS_DECIDED',
      nextPeriod: nextYear(2),
    });
    expect(again.status).toBe(409);
    expect(h.codeOf(again)).toBe('SUBSCRIPTION_RENEWAL.NOT_RENEWABLE');
    expect(detailsOf(again)).toMatchObject({ reason: 'ALREADY_CONTINUED' });
  });

  it('refuses in the order of the rule: the point, then the number, then the cancellation (§4.4 steps 4, 6)', async () => {
    const unit = await h.unit(2);
    const early = await h.termWithSeats(unit, 60, { quantity: 10, ...year() });
    const before = await record({
      subscriptionId: early.subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
      outcome: 'UNCONFIRMED',
    });
    expect(before.status).toBe(409);
    expect(h.codeOf(before)).toBe('SUBSCRIPTION_RENEWAL.BEFORE_ADJUSTMENT_POINT');

    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    const wrong = await record({ subscriptionId, choice: 'REDUCE', proposedQuantity: 5, outcome: 'UNCONFIRMED' });
    expect(wrong.status).toBe(409);
    expect(h.codeOf(wrong)).toBe('SUBSCRIPTION_RENEWAL.QUANTITY_NOT_SEATS_NEEDED');
    expect(detailsOf(wrong)).toMatchObject({ seatsNeeded: 2, target: 2, quantity: 5 });

    const cancel = await record({
      subscriptionId,
      choice: 'CANCEL',
      outcome: 'AS_DECIDED',
      closure: { dataExported: true, adminsTransferred: true },
    });
    expect(cancel.status).toBe(409);
    expect(h.codeOf(cancel)).toBe('SUBSCRIPTION_RENEWAL.CANCEL_NOT_ALLOWED');
    expect(detailsOf(cancel)).toMatchObject({ seatsNeeded: 2, heldPastRenewal: 2, activeSeatsToday: 2 });
    // Nothing was written by any of them.
    const { rows } = await h.ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM subscription_renewals WHERE subscription_id = $1`,
      [subscriptionId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('lets another IT Admin record for the one responsible: the audit says so and the one responsible is told (QĐ-58b)', async () => {
    const unit = await h.unit(2);
    const other = await handOthersToSecondItAdmin(h);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $1 WHERE id = $2`, [
      h.it1.employeeId,
      subscriptionId,
    ]);

    const response = await record(
      { subscriptionId, choice: 'REDUCE', proposedQuantity: 2, outcome: 'AS_DECIDED', nextPeriod: nextYear(2) },
      other,
    );

    expect(response.status).toBe(201);
    const id = h.dataOf<{ renewal: CaseWire }>(response).renewal.id;
    const proposed = (await h.auditOf('SubscriptionRenewal', id)).find(
      (event) => event.action === 'SUBSCRIPTION_RENEWAL.PROPOSED',
    );
    expect(proposed?.after).toMatchObject({ substitute: true, responsibleItAdminEmployeeId: h.it1.employeeId });
    const told = await h.notices('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', subscriptionId);
    expect(told.map((notice) => notice.recipient_employee_id)).toContain(h.it1.employeeId);
    expect(told[0].params).toMatchObject({ renewalId: id, choice: 'REDUCE', quantity: 2, substitute: true });
  });

  it('tells the spending approver, the IT Admin and Finance at once when the vendor kept more seats than chosen (QĐ-106i(4))', async () => {
    const unit = await h.unit(2);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });

    const response = await record({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
      outcome: 'VENDOR_REFUSED',
      outcomeNote: 'The vendor renewed ten seats.',
      nextPeriod: nextYear(10),
    });

    expect(response.status).toBe(201);
    const id = h.dataOf<{ renewal: CaseWire }>(response).renewal.id;
    const incident = await h.notices('SUBSCRIPTION_AUTO_RENEWAL_INCIDENT', subscriptionId);
    expect(incident.length).toBeGreaterThanOrEqual(2);
    expect(incident[0].params).toMatchObject({ renewalId: id });
  });
  it('leaves on the old period a seat that ends on the renewal day, so the exact count is recorded (R2-2, QĐ-106i(2))', async () => {
    const unit = await h.unit(2);
    const { subscriptionId, seats } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    // The seat of the first person ends on the renewal day: it is not needed after it and is not carried into the new period.
    await h.ctx.sql.query(`UPDATE license_assignments SET expected_end_date = $1 WHERE id = $2`, [
      h.inDays(64),
      seats[0],
    ]);

    const response = await record({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 1,
      outcome: 'AS_DECIDED',
      nextPeriod: { ...nextYear(1), startDate: h.inDays(64), endDate: h.inDays(428) },
    });

    expect(response.status).toBe(201);
    const next = h.dataOf<{ renewal: CaseWire }>(response).renewal.outcomeDetail?.nextSubscriptionId as string;
    const { rows } = await h.ctx.sql.query<{ predecessor_id: string }>(
      `SELECT predecessor_id FROM license_assignments WHERE subscription_id = $1 AND source = 'RENEWAL_CARRY'`,
      [next],
    );
    expect(rows.map((row) => row.predecessor_id)).toEqual([seats[1]]);
  });
});
