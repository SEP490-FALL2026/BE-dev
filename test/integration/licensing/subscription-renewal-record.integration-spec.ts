import { RenewalHarness } from '../../support/renewal-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { takeOwnerOff } from '../../support/shared-pool-subscription';

const h = new RenewalHarness();

interface CaseWire {
  id: string;
  state: string;
  subscription: { ownerDepartmentId: string | null };
  waitingReason: string | null;
  proposal: { choice: string; quantity: number | null; seatsNeeded: number | null };
  decision: { choice: string; deciderRole: string } | null;
  outcomeDetail: { kind: string; nextSubscriptionId: string | null; lateRenewal: boolean } | null;
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
      outcome: 'AS_DECIDED',
    });
    expect(before.status).toBe(409);
    expect(h.codeOf(before)).toBe('SUBSCRIPTION_RENEWAL.BEFORE_ADJUSTMENT_POINT');

    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    const wrong = await record({ subscriptionId, choice: 'REDUCE', proposedQuantity: 5, outcome: 'AS_DECIDED' });
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

  it('needs the new period of a renewal, a reduction or an increase, and a result the vendor has not confirmed is not one the route takes (A1C-03)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    const periods = () => h.count('subscriptions');
    const before = await periods();

    // A period the vendor has not confirmed yet is not recorded: the IT Admin records once the vendor confirmed.
    const unconfirmed = await record({ subscriptionId, choice: 'REDUCE', proposedQuantity: 2, outcome: 'UNCONFIRMED' });
    expect(unconfirmed.status).toBe(422);
    expect(h.codeOf(unconfirmed)).toBe('VALIDATION_ERROR');
    // Every other outcome of a plan by the year carries the period, else the case would be written with no way to ever record it.
    const bodies = [
      { outcome: 'AS_DECIDED' },
      { outcome: 'DIFFERENT', outcomeNote: 'The vendor sold another bundle.' },
      { outcome: 'VENDOR_REFUSED', outcomeNote: 'The vendor kept the seats.' },
    ];
    for (const body of bodies) {
      const response = await record({ subscriptionId, choice: 'REDUCE', proposedQuantity: 2, ...body });
      expect(response.status).toBe(422);
      expect(h.codeOf(response)).toBe('SUBSCRIPTION_RENEWAL.NEXT_PERIOD_REQUIRED');
    }
    expect(await periods()).toBe(before);
    const { rows } = await h.ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM subscription_renewals WHERE subscription_id = $1`,
      [subscriptionId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('needs the new period of a cancellation the vendor did not carry out, whatever the plan: nobody is told otherwise (V-2)', async () => {
    const unit = await h.unit(0);
    for (const outcome of [
      { outcome: 'VENDOR_REFUSED', outcomeNote: 'The vendor renewed it on its own.' },
      { outcome: 'DIFFERENT', outcomeNote: 'The vendor closed it another way.' },
    ]) {
      const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
      const before = await h.count('subscriptions');

      const refused = await record({ subscriptionId, choice: 'CANCEL', ...outcome });

      expect(refused.status).toBe(422);
      expect(h.codeOf(refused)).toBe('SUBSCRIPTION_RENEWAL.NEXT_PERIOD_REQUIRED');
      expect(await h.count('subscriptions')).toBe(before);
      const { rows } = await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM subscription_renewals WHERE subscription_id = $1`,
        [subscriptionId],
      );
      expect(rows[0].n).toBe(0);
    }
  });

  it('records the period the vendor made of a cancellation and tells the spending approver, the IT Admin and Finance (V-2, QĐ-106i(4))', async () => {
    const unit = await h.unit(0);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });

    const response = await record({
      subscriptionId,
      choice: 'CANCEL',
      outcome: 'VENDOR_REFUSED',
      outcomeNote: 'The vendor renewed it on its own.',
      nextPeriod: nextYear(10),
    });

    expect(response.status).toBe(201);
    const renewal = h.dataOf<{ renewal: CaseWire }>(response).renewal;
    expect(renewal.outcomeDetail?.nextSubscriptionId).not.toBeNull();
    const incident = await h.notices('SUBSCRIPTION_AUTO_RENEWAL_INCIDENT', subscriptionId);
    expect(incident.map((notice) => notice.recipient_employee_id).sort()).toEqual(
      [h.boss.employeeId, h.it1.employeeId, h.finance.employeeId].sort(),
    );
    expect(incident[0].params).toMatchObject({ renewalId: renewal.id });
  });

  it('lets a plan by the month record that the vendor refused with no new period: the next payment day is another point (A1C-03)', async () => {
    const unit = await h.unit(2);
    const subscriptionId = await h.term({
      quantity: 10,
      billingCycle: 'MONTHLY',
      startDate: h.inDays(-25),
      renewalDate: h.inDays(5),
      endDate: h.inDays(5),
      autoRenew: true,
      ownerDepartmentId: unit.department.id,
    });
    for (const member of unit.members) await h.seatOf(member, { subscriptionId });
    await takeOwnerOff(h, subscriptionId);

    const response = await record({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
      outcome: 'VENDOR_REFUSED',
      outcomeNote: 'The vendor will not lower the seats this month.',
    });

    expect(response.status).toBe(201);
    expect(h.dataOf<{ renewal: CaseWire }>(response).renewal).toMatchObject({
      state: 'OUTCOME_RECORDED',
      outcomeDetail: { kind: 'VENDOR_REFUSED', nextSubscriptionId: null },
    });
  });

  it('starts the new period on the renewal day: a reduction in the middle of a year, or a gap after it, is refused and writes nothing (A1C-04)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId, seats } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    const periods = () => h.count('subscriptions');
    const before = await periods();
    const attempt = (startDays: number) =>
      record({
        subscriptionId,
        choice: 'REDUCE',
        proposedQuantity: 2,
        outcome: 'AS_DECIDED',
        nextPeriod: { ...nextYear(2), startDate: h.inDays(startDays), endDate: h.inDays(startDays + 364) },
      });

    // Tomorrow, the day before the renewal day and two days after it (the renewal day is day 64 of the year): none is the day of the renewal.
    for (const days of [1, 63, 66]) {
      const refused = await attempt(days);
      expect(refused.status).toBe(409);
      expect(h.codeOf(refused)).toBe('SUBSCRIPTION_RENEWAL.PERIOD_REFUSED');
      expect(detailsOf(refused)).toEqual({ reason: 'NOT_ON_RENEWAL_DAY', renewalOn: h.inDays(64) });
    }
    expect(await periods()).toBe(before);
    const { rows } = await h.ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM subscription_renewals WHERE subscription_id = $1`,
      [subscriptionId],
    );
    expect(rows[0].n).toBe(0);
    expect(await h.revocationReasons(seats)).toEqual([]);

    // The renewal day itself (the last day of the old period) and the day after it are both the day of the renewal.
    const onTheDay = await attempt(64);
    expect(onTheDay.status).toBe(201);
    expect(await periods()).toBe(before + 1);
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

  it('is also an incident when a recorded increase bought more seats than the system counted, told to the approver, the IT Admin and Finance (A1C-05, QĐ-104d)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 3, ...year() });
    await h.ctx.sql.query(`UPDATE subscriptions SET vendor_minimum_seats = 5 WHERE id = $1`, [subscriptionId]);

    const response = await record({
      subscriptionId,
      choice: 'INCREASE',
      proposedQuantity: 5,
      note: 'The vendor sells nothing under five seats (contract 4.2).',
      outcome: 'DIFFERENT',
      outcomeNote: 'The vendor invoiced nine seats.',
      nextPeriod: nextYear(9),
    });

    expect(response.status).toBe(201);
    const id = h.dataOf<{ renewal: CaseWire }>(response).renewal.id;
    const incident = await h.notices('SUBSCRIPTION_AUTO_RENEWAL_INCIDENT', subscriptionId);
    expect(incident.map((notice) => notice.recipient_employee_id).sort()).toEqual(
      [h.boss.employeeId, h.it1.employeeId, h.finance.employeeId].sort(),
    );
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

  it('records and reads back a K2 subscription no department owns: the case never hides behind an owner (H1, S20-T7)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    await takeOwnerOff(h, subscriptionId);

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
      subscription: { ownerDepartmentId: null },
      waitingReason: null,
      proposal: { choice: 'REDUCE', quantity: 2, seatsNeeded: 2 },
      decision: { choice: 'REDUCE', deciderRole: 'IT_ADMIN_IN_CHARGE' },
      outcomeDetail: { kind: 'AS_DECIDED', lateRenewal: false },
    });
    // Every reader of the cases finds it: the IT Admin and Finance; the head of a department sees none of a pool subscription.
    const asIt = await h.read(renewal.id);
    expect(asIt.status).toBe(200);
    expect(h.dataOf<{ renewal: CaseWire }>(asIt).renewal.subscription.ownerDepartmentId).toBeNull();
    expect((await h.read(renewal.id, h.finance)).status).toBe(200);
    expect((await h.read(renewal.id, unit.head.account)).status).toBe(404);
    const listed = await h.renewals(`?subscriptionId=${subscriptionId}`, h.finance);
    expect(listed.status).toBe(200);
    expect(h.dataOf<{ items: Array<{ id: string }> }>(listed).items.map((item) => item.id)).toEqual([renewal.id]);
    // Finance is told of the new period (QĐ-106i(3)), and nobody else is asked.
    const told = await h.notices('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', subscriptionId);
    expect(told.map((notice) => notice.recipient_employee_id)).toContain(h.finance.employeeId);
    expect((await h.deadlineEvents('', h.finance)).status).toBe(200);
  });

  it('records the result of a K2 pool subscription by the month at its payment day, the period continuing on the same line of seats (S20-T4 checkpoint)', async () => {
    const unit = await h.unit(2);
    // A plan by the month: paid on a day 5 days away, so today is inside the 7 days of its point of adjustment.
    const subscriptionId = await h.term({
      quantity: 10,
      billingCycle: 'MONTHLY',
      startDate: h.inDays(-25),
      renewalDate: h.inDays(5),
      endDate: h.inDays(5),
      autoRenew: true,
      ownerDepartmentId: unit.department.id,
    });
    const seats: string[] = [];
    for (const member of unit.members) seats.push(await h.seatOf(member, { subscriptionId }));
    await takeOwnerOff(h, subscriptionId);

    const response = await record({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
      outcome: 'AS_DECIDED',
      nextPeriod: {
        purchasedQuantity: 2,
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: h.inDays(5),
        endDate: h.inDays(35),
        renewalDate: h.inDays(35),
        autoRenew: true,
        allowsMidTermReduction: false,
      },
    });

    expect(response.status).toBe(201);
    const renewal = h.dataOf<{ renewal: CaseWire }>(response).renewal;
    expect(renewal).toMatchObject({
      state: 'OUTCOME_RECORDED',
      subscription: { ownerDepartmentId: null },
      proposal: { choice: 'REDUCE', quantity: 2, seatsNeeded: 2 },
      decision: { deciderRole: 'IT_ADMIN_IN_CHARGE' },
      outcomeDetail: { kind: 'AS_DECIDED', lateRenewal: false },
    });
    const next = renewal.outcomeDetail?.nextSubscriptionId as string;
    const { rows: carried } = await h.ctx.sql.query<{ predecessor_id: string }>(
      `SELECT predecessor_id FROM license_assignments WHERE subscription_id = $1 AND source = 'RENEWAL_CARRY'`,
      [next],
    );
    expect(carried.map((row) => row.predecessor_id).sort()).toEqual([...seats].sort());
  });

  it('does not open the point of the period it has just recorded: the new line of a plan by the month pays one month after its start day (V-1)', async () => {
    const unit = await h.unit(2);
    const subscriptionId = await h.term({
      quantity: 10,
      billingCycle: 'MONTHLY',
      startDate: h.inDays(-25),
      renewalDate: h.inDays(5),
      endDate: h.inDays(5),
      autoRenew: true,
      ownerDepartmentId: unit.department.id,
    });
    for (const member of unit.members) await h.seatOf(member, { subscriptionId });
    await takeOwnerOff(h, subscriptionId);

    const response = await record({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
      outcome: 'AS_DECIDED',
      nextPeriod: {
        purchasedQuantity: 2,
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: h.inDays(5),
        endDate: h.inDays(35),
        renewalDate: h.inDays(35),
        autoRenew: true,
        allowsMidTermReduction: false,
      },
    });
    expect(response.status).toBe(201);
    const next = h.dataOf<{ renewal: CaseWire }>(response).renewal.outcomeDetail?.nextSubscriptionId as string;

    // The day of the purchase is the start day of the new line, not a payment day: today it asks and alerts nothing of it.
    await h.sweepOn(h.today());
    await h.sweepOn(h.inDays(1));
    expect(await h.notices('SUBSCRIPTION_RENEWAL_ALERT', next)).toEqual([]);
    const read = await h.adjustment(next);
    expect(read.status).toBe(200);
    const adjustment = h.dataOf<{ adjustment: { adjustmentPointOn: string; deadline: string } }>(read).adjustment;
    expect(adjustment.deadline).toBe(h.inDays(35));
    expect(adjustment.adjustmentPointOn > h.today()).toBe(true);
  });

  it('records an increase to the vendor minimum with its evidence, and the outcome as decided matches it (R2-3, QĐ-103q)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 3, ...year() });
    await h.ctx.sql.query(`UPDATE subscriptions SET vendor_minimum_seats = 5 WHERE id = $1`, [subscriptionId]);

    const response = await record({
      subscriptionId,
      choice: 'INCREASE',
      proposedQuantity: 5,
      note: 'The vendor sells nothing under five seats (contract 4.2).',
      outcome: 'AS_DECIDED',
      nextPeriod: nextYear(5),
    });

    expect(response.status).toBe(201);
    expect(h.dataOf<{ renewal: CaseWire }>(response).renewal).toMatchObject({
      state: 'OUTCOME_RECORDED',
      proposal: { choice: 'INCREASE', quantity: 5, seatsNeeded: 2 },
      decision: { choice: 'INCREASE' },
      outcomeDetail: { kind: 'AS_DECIDED' },
    });
  });

  it('refuses a new result while a case decided before this rule still waits for its outcome (R2-1)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    const legacy = await h.legacyDecidedRenewal(subscriptionId, {
      choice: 'REDUCE',
      quantity: 4,
      decidedBy: unit.head,
    });

    const response = await record({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
      outcome: 'AS_DECIDED',
      nextPeriod: nextYear(2),
    });

    expect(response.status).toBe(409);
    expect(h.codeOf(response)).toBe('SUBSCRIPTION_RENEWAL.ALREADY_PROPOSED');
    expect(detailsOf(response)).toEqual({ renewalId: legacy });
  });
});
