import { RenewalHarness } from '../../support/renewal-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';

const h = new RenewalHarness();

interface OutcomeWire {
  state: string;
  outcomeDetail: {
    kind: string;
    vendorFollowUpOpen: boolean;
    nextSubscriptionId: string | null;
    realisedSavings: { amount: string; currency: string } | null;
  } | null;
}

/**
 * The cases decided before the one-write rule (`SBF-20` §4.4, §5): a head confirmed them, the IT Admin has still to record what the vendor
 * did, and `POST /subscription-renewals/{id}/outcome` is the only way left to do it. The cases are written as the old routes wrote them
 * (state `DECIDED`); what is kept is the core of the outcome they share with the new route: the chain once, the seats carried, the savings,
 * the note a different outcome must carry (`QĐ-96i`), the one winner of two writes, and who may record.
 */
describe('the outcome of a case decided before the one-write rule (integration, real PostgreSQL)', () => {
  const year = () => ({ startDate: h.inDays(-300), endDate: h.inDays(64) });
  const nextYear = (quantity: number, unitPrice = '1000000') => ({
    purchasedQuantity: quantity,
    unitPrice: { amount: unitPrice, currency: 'VND' },
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

  /** A year of a unit whose people hold a seat each and the case a head decided on it. */
  const legacy = async (choice: 'RENEW' | 'REDUCE' | 'CANCEL', quantity?: number, members = 2) => {
    const unit = await h.unit(members);
    const { subscriptionId, seats } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    const id = await h.legacyDecidedRenewal(subscriptionId, {
      choice,
      ...(quantity !== undefined ? { quantity } : {}),
      decidedBy: unit.head,
    });

    return { unit, subscriptionId, seats, id };
  };
  const recorded = async (id: string, body: object) =>
    h.dataOf<{ renewal: OutcomeWire }>(await h.outcome(id, body).expect(200)).renewal;

  it('chains the renewal to the old period once, carries the seats and answers a second write with NOT_AWAITING_OUTCOME', async () => {
    const { subscriptionId, seats, id } = await legacy('RENEW');

    const renewal = await recorded(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear(10) });

    const next = renewal.outcomeDetail?.nextSubscriptionId as string;
    expect(renewal).toMatchObject({ state: 'OUTCOME_RECORDED', outcomeDetail: { kind: 'AS_DECIDED' } });
    const { rows: carried } = await h.ctx.sql.query<{ predecessor_id: string }>(
      `SELECT predecessor_id FROM license_assignments WHERE subscription_id = $1 AND source = 'RENEWAL_CARRY'`,
      [next],
    );
    expect(carried.map((row) => row.predecessor_id).sort()).toEqual([...seats].sort());
    const { rows: chain } = await h.ctx.sql.query<{ renewed_from_id: string }>(
      `SELECT renewed_from_id FROM subscriptions WHERE id = $1`,
      [next],
    );
    expect(chain[0].renewed_from_id).toBe(subscriptionId);
    expect(h.codeOf(await h.outcome(id, { outcome: 'UNCONFIRMED' }).expect(409))).toBe(
      'SUBSCRIPTION_RENEWAL.NOT_AWAITING_OUTCOME',
    );
  });

  it('refuses a reduction whose seats are still held, then records it with no saving yet, which is written when Finance confirms the first invoice of the new period', async () => {
    const { seats, id } = await legacy('REDUCE', 1, 3);

    expect(h.codeOf(await h.outcome(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear(5) }).expect(422))).toBe(
      'SUBSCRIPTION_RENEWAL.OUTCOME_MISMATCH',
    );
    const blocked = await h.outcome(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear(1) }).expect(409);
    expect(h.codeOf(blocked)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED');
    expect(h.detailsOf(blocked)).toEqual({ seatsInUse: 3, quantity: 1 });
    expect((await h.caseRow(id)).state).toBe('DECIDED');
    // The two seats leave: their revocations are done.
    for (const seat of seats.slice(1)) {
      await h.openRevocation(seat);
      const task = await h.liveTaskOf(seat);
      await h.claim(task?.id as string).expect(200);
      await h
        .revoked(task?.id as string, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
        .expect(200);
    }

    const renewal = await recorded(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear(1) });

    expect(renewal.outcomeDetail).toMatchObject({
      kind: 'AS_DECIDED',
      // The IT Admin records no saving: it is written once, when Finance confirms the first invoice of the new period.
      realisedSavings: null,
    });
  });

  it('records a period the vendor kept unchanged against a reduction, with the follow-up open and no savings', async () => {
    const { id } = await legacy('REDUCE', 8, 1);

    const renewal = await recorded(id, {
      outcome: 'DIFFERENT',
      note: 'The vendor renewed the ten seats',
      nextPeriod: nextYear(10, '900000'),
    });

    expect(renewal.outcomeDetail).toMatchObject({ kind: 'DIFFERENT', vendorFollowUpOpen: true, realisedSavings: null });
  });

  it('points the money errors of the new period at nextPeriod.unitPrice, the field of this body too (FIX-E-R2)', async () => {
    const { id } = await legacy('RENEW');

    const scale = await h.outcome(id, {
      outcome: 'AS_DECIDED',
      nextPeriod: { ...nextYear(10), unitPrice: { amount: '1000000.5', currency: 'VND' } },
    });
    expect(scale.status).toBe(422);
    expect(h.codeOf(scale)).toBe('MONEY_SCALE_EXCEEDED');
    expect(h.detailsOf(scale)).toEqual({ allowedDecimals: 0, path: 'nextPeriod.unitPrice' });
    expect((await h.caseRow(id)).state).toBe('DECIDED');
  });

  it('asks the note of an outcome that is not the decision, the reason and the evidence, and not of the others (QĐ-96i)', async () => {
    const refused = await legacy('RENEW', undefined, 0);
    const different = await legacy('RENEW', undefined, 0);
    const open = await legacy('RENEW', undefined, 0);

    expect(h.codeOf(await h.outcome(refused.id, { outcome: 'VENDOR_REFUSED' }).expect(422))).toBe('VALIDATION_ERROR');
    expect(h.codeOf(await h.outcome(different.id, { outcome: 'DIFFERENT' }).expect(422))).toBe('VALIDATION_ERROR');
    expect((await h.caseRow(refused.id)).state).toBe('DECIDED');
    await h
      .outcome(refused.id, { outcome: 'VENDOR_REFUSED', note: 'The vendor will not renew; e-mail of 05/11' })
      .expect(200);
    await h.outcome(open.id, { outcome: 'UNCONFIRMED' }).expect(200);
  });

  it('records a cancellation only once every seat is taken back (the old rule of the legacy route)', async () => {
    const { seats, id } = await legacy('CANCEL', undefined, 1);

    const held = await h.outcome(id, { outcome: 'AS_DECIDED' }).expect(409);
    expect(h.codeOf(held)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED');
    expect(h.detailsOf(held)).toEqual({ seatsInUse: 1, quantity: 0 });
    await h.openRevocation(seats[0]);
    const task = await h.liveTaskOf(seats[0]);
    await h.claim(task?.id as string).expect(200);
    await h
      .revoked(task?.id as string, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
      .expect(200);

    expect((await recorded(id, { outcome: 'AS_DECIDED' })).state).toBe('OUTCOME_RECORDED');
  });

  it('records one outcome and one new period when two IT Admins record at the same time (QĐ-16, US-11-03 AC-4)', async () => {
    const { subscriptionId, id } = await legacy('RENEW', undefined, 1);

    const answers = await Promise.all([
      h.outcome(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear(10) }),
      h.outcome(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear(10) }),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect(h.codeOf(answers.find((answer) => answer.status === 409) as (typeof answers)[number])).toBe(
      'SUBSCRIPTION_RENEWAL.NOT_AWAITING_OUTCOME',
    );
    const { rows } = await h.ctx.sql.query(`SELECT id FROM subscriptions WHERE renewed_from_id = $1`, [subscriptionId]);
    expect(rows).toHaveLength(1);
  });

  it('lets only the IT Admin record an outcome, never the decider (SoD-7, US-11-02 AC-17)', async () => {
    const { unit, id } = await legacy('RENEW', undefined, 0);

    expect((await h.outcome(id, { outcome: 'UNCONFIRMED' }, unit.head.account)).status).toBe(403);
    expect((await h.outcome(id, { outcome: 'UNCONFIRMED' }, h.finance)).status).toBe(403);
    await h.outcome(id, { outcome: 'UNCONFIRMED' }).expect(200);
  });

  it('keeps the role of a decision: the three of before, the IT Admin in charge and the system are the only ones the database accepts', async () => {
    const { rows } = await h.ctx.sql.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'subscription_renewals_decider_role'`,
    );

    expect(rows).toHaveLength(1);
    const accepted = [...rows[0].definition.matchAll(/'([A-Z_]+)'::text/g)].map((match) => match[1]).sort();
    expect(accepted).toEqual(
      ['CONFLICT_SUBSTITUTE', 'IT_ADMIN_IN_CHARGE', 'OWNER_DEPARTMENT_HEAD', 'SPENDING_APPROVER', 'SYSTEM'].sort(),
    );
  });

  it('refuses a non-responsible IT Admin with 403 NOT_RESPONSIBLE whether the responsible admin is active or locked', async () => {
    const other = await handOthersToSecondItAdmin(h);
    const { subscriptionId, id } = await legacy('RENEW', undefined, 0);
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $1 WHERE id = $2`, [
      h.it1.employeeId,
      subscriptionId,
    ]);

    const denied = await h.outcome(id, { outcome: 'UNCONFIRMED' }, other);
    expect([denied.status, h.codeOf(denied)]).toEqual([403, 'SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE']);

    const lockedEmp = await h.person('E-RN-LEGACY-LOCKED');
    await h.account('E-RN-LEGACY-LOCKED', lockedEmp, 'IT_ADMIN');
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $1 WHERE id = $2`, [
      lockedEmp,
      subscriptionId,
    ]);
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [lockedEmp]);

    const deniedWhileLocked = await h.outcome(id, { outcome: 'UNCONFIRMED' });
    expect([deniedWhileLocked.status, h.codeOf(deniedWhileLocked)]).toEqual([
      403,
      'SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE',
    ]);
  });
});
