import { RenewalHarness, type RenewalUnit } from '../../support/renewal-harness';

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

interface SeatRow {
  id: string;
  subscription_id: string;
  source: string;
  predecessor_id: string | null;
  valid_from: string;
  valid_until: string | null;
}

/**
 * EP-11 on real PostgreSQL: the outcome the IT Admin records once a decision is carried out with the vendor (`US-11-05` AC-9 →
 * AC-12, `US-11-03`): the new period chained once to the old one (`QĐ-16`), the seats carried to it (`QĐ-35c`), the excess taken back
 * first (`INV-01`), the savings only from a cheaper confirmed period (`QĐ-66w`), what the vendor really did when it differs, and
 * still no budget commitment.
 */
describe('the outcome of a renewal and the chain of periods (integration, real PostgreSQL)', () => {
  // A year that started 300 days ago, its deadline in 20 days, and the next year of the same length.
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

  const seatsOf = async (subscriptionIds: readonly string[]) =>
    (
      await h.ctx.sql.query<SeatRow>(
        `SELECT id, subscription_id, source::text AS source, predecessor_id, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
                to_char(valid_until, 'YYYY-MM-DD') AS valid_until
           FROM license_assignments WHERE subscription_id = ANY($1::uuid[]) ORDER BY created_at, id`,
        [subscriptionIds],
      )
    ).rows;
  const decided = async (unit: RenewalUnit, body: Record<string, unknown>, quantity = 10) => {
    const { subscriptionId, seats } = await h.termWithSeats(unit, 20, { quantity, ...year() });
    const id = await h.proposedRenewal({
      subscriptionId,
      choice: body.choice,
      ...(body.quantity !== undefined ? { proposedQuantity: body.quantity } : {}),
    });
    await h.decideRenewal(id, body, h.boss.account).expect(200);

    return { subscriptionId, seats, id };
  };
  const recorded = async (id: string, body: object) =>
    h.dataOf<{ renewal: OutcomeWire }>(await h.outcome(id, body).expect(200)).renewal;

  it('chains a renewal as it is to the old period once, carries every seat and saves nothing (US-11-03 AC-1, AC-2, AC-4, AC-17)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId, seats, id } = await decided(unit, { choice: 'RENEW' });
    const commitmentsBefore = await h.count('budget_commitments');

    const renewal = await recorded(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear(10) });

    const next = renewal.outcomeDetail?.nextSubscriptionId as string;
    expect(renewal).toMatchObject({
      state: 'OUTCOME_RECORDED',
      outcomeDetail: { kind: 'AS_DECIDED', vendorFollowUpOpen: false, realisedSavings: null },
    });
    const { rows: chain } = await h.ctx.sql.query<{ renewed_from_id: string; status: string }>(
      `SELECT renewed_from_id, status::text FROM subscriptions WHERE id = $1`,
      [next],
    );
    expect(chain[0]).toEqual({ renewed_from_id: subscriptionId, status: 'ACTIVE' });
    const rows = await seatsOf([subscriptionId, next]);
    const old = rows.filter((row) => row.subscription_id === subscriptionId);
    const carried = rows.filter((row) => row.subscription_id === next);
    expect(old.map((row) => row.valid_until)).toEqual([h.inDays(65), h.inDays(65)]);
    expect(carried.map((row) => [row.source, row.valid_from, row.valid_until])).toEqual([
      ['RENEWAL_CARRY', h.inDays(65), null],
      ['RENEWAL_CARRY', h.inDays(65), null],
    ]);
    expect(carried.map((row) => row.predecessor_id).sort()).toEqual([...seats].sort());
    expect(await h.count('budget_commitments')).toBe(commitmentsBefore);
    expect(h.codeOf(await h.outcome(id, { outcome: 'UNCONFIRMED' }).expect(409))).toBe(
      'SUBSCRIPTION_RENEWAL.NOT_AWAITING_OUTCOME',
    );
    // The database keeps the chain single whoever writes it.
    await expect(
      h.ctx.sql.query(
        `INSERT INTO subscriptions (id, organization_id, plan_id, kind, owner_department_id, renewed_from_id, start_date, updated_at)
         SELECT gen_random_uuid(), organization_id, plan_id, kind, owner_department_id, $1, $2::date, now()
           FROM subscriptions WHERE id = $1`,
        [subscriptionId, h.inDays(70)],
      ),
    ).rejects.toMatchObject({ constraint: 'subscriptions_renewed_from_id_key' });
    expect(await h.auditOf('SubscriptionRenewal', id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED' })]),
    );
    const renewedAudit = (await h.auditOf('Subscription', next)).filter(
      (event) => event.action === 'SUBSCRIPTION.RENEWED',
    );
    expect(renewedAudit).toHaveLength(1);
    expect(renewedAudit[0].after).toMatchObject({ renewedFromId: subscriptionId });
  });

  it('chains a second renewal (B to C) once, carries the seats of B and leaves A untouched (QĐ-16, QĐ-35c)', async () => {
    const unit = await h.unit(2);
    const { subscriptionId: a, id: firstCase } = await decided(unit, { choice: 'RENEW' });
    const b = (await recorded(firstCase, { outcome: 'AS_DECIDED', nextPeriod: nextYear(10) })).outcomeDetail
      ?.nextSubscriptionId as string;
    const seatsOfB = (await seatsOf([b])).map((row) => row.id);

    const secondCase = await h.proposedRenewal({ subscriptionId: b, choice: 'RENEW' });
    await h.decideRenewal(secondCase, { choice: 'RENEW' }, h.boss.account).expect(200);
    const c = (
      await recorded(secondCase, {
        outcome: 'AS_DECIDED',
        nextPeriod: {
          ...nextYear(10),
          startDate: h.inDays(430),
          endDate: h.inDays(794),
          noticeDeadline: h.inDays(765),
        },
      })
    ).outcomeDetail?.nextSubscriptionId as string;

    const { rows: links } = await h.ctx.sql.query<{ id: string; renewed_from_id: string | null }>(
      `SELECT id, renewed_from_id FROM subscriptions WHERE id = ANY($1::uuid[])`,
      [[a, b, c]],
    );
    const parentOf = (id: string) => links.find((row) => row.id === id)?.renewed_from_id;
    expect([parentOf(a), parentOf(b), parentOf(c)]).toEqual([null, a, b]);
    const carried = (await seatsOf([c])).filter((row) => row.source === 'RENEWAL_CARRY');
    expect(carried.map((row) => row.predecessor_id).sort()).toEqual([...seatsOfB].sort());
    expect(carried.every((row) => row.valid_from === h.inDays(430) && row.valid_until === null)).toBe(true);
    expect((await seatsOf([b])).map((row) => row.valid_until)).toEqual([h.inDays(430), h.inDays(430)]);
    // A keeps the single successor it had; B now has its own and the database refuses a second one for either.
    for (const parent of [a, b]) {
      await expect(
        h.ctx.sql.query(
          `INSERT INTO subscriptions (id, organization_id, plan_id, kind, owner_department_id, renewed_from_id, start_date, updated_at)
           SELECT gen_random_uuid(), organization_id, plan_id, kind, owner_department_id, $1, $2::date, now()
             FROM subscriptions WHERE id = $1`,
          [parent, h.inDays(900)],
        ),
      ).rejects.toMatchObject({ constraint: 'subscriptions_renewed_from_id_key' });
    }
    const { rows: successors } = await h.ctx.sql.query(
      `SELECT id FROM subscriptions WHERE renewed_from_id = ANY($1::uuid[])`,
      [[a, b]],
    );
    expect(successors).toHaveLength(2);
    expect(
      (await h.auditOf('Subscription', c)).filter((event) => event.action === 'SUBSCRIPTION.RENEWED'),
    ).toHaveLength(1);
  });

  it('refuses the new period while the excess is still held, then records it with the savings it shows (US-11-03 AC-3, AC-5, AC-12, US-11-05 AC-9)', async () => {
    const term = await h.termWithSeats(await h.unit(3), 20, { quantity: 10, ...year() });
    const caseId = await h.proposedRenewal({
      subscriptionId: term.subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 2,
    });
    await h
      .decideRenewal(caseId, { choice: 'REDUCE', quantity: 2, releasedAssignmentIds: [term.seats[0]] }, h.boss.account)
      .expect(200);

    expect(h.codeOf(await h.outcome(caseId, { outcome: 'AS_DECIDED', nextPeriod: nextYear(5) }).expect(422))).toBe(
      'SUBSCRIPTION_RENEWAL.OUTCOME_MISMATCH',
    );
    const blocked = await h.outcome(caseId, { outcome: 'AS_DECIDED', nextPeriod: nextYear(2) }).expect(409);
    expect(h.codeOf(blocked)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED');
    expect(h.detailsOf(blocked)).toEqual({ seatsInUse: 3, quantity: 2 });
    expect((await h.caseRow(caseId)).state).toBe('DECIDED');

    const task = await h.liveTaskOf(term.seats[0]);
    await h.claim(task?.id as string).expect(200);
    await h
      .revoked(task?.id as string, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
      .expect(200);
    const renewal = await recorded(caseId, { outcome: 'AS_DECIDED', nextPeriod: nextYear(2) });

    expect(renewal.outcomeDetail).toMatchObject({
      kind: 'AS_DECIDED',
      realisedSavings: { amount: '8000000', currency: 'VND' },
    });
    const carried = (await seatsOf([renewal.outcomeDetail?.nextSubscriptionId as string])).map(
      (row) => row.predecessor_id,
    );
    expect(carried.sort()).toEqual([term.seats[1], term.seats[2]].sort());
  });

  it('records a period the vendor kept unchanged against a reduction, with the follow-up open and no savings (US-11-03 AC-15, AC-18)', async () => {
    const unit = await h.unit(1);
    const { id } = await decided(unit, { choice: 'REDUCE', quantity: 8 });

    expect(h.codeOf(await h.outcome(id, { outcome: 'AS_DECIDED', nextPeriod: nextYear(10) }).expect(422))).toBe(
      'SUBSCRIPTION_RENEWAL.OUTCOME_MISMATCH',
    );
    const renewal = await recorded(id, {
      outcome: 'DIFFERENT',
      note: 'The vendor renewed the ten seats',
      nextPeriod: nextYear(10, '900000'),
    });

    expect(renewal.outcomeDetail).toMatchObject({ kind: 'DIFFERENT', vendorFollowUpOpen: true, realisedSavings: null });
    expect(renewal.outcomeDetail?.nextSubscriptionId).not.toBeNull();
  });

  it('records a cancellation only once every seat is taken back, and what the vendor did otherwise (US-11-03 AC-9, US-11-05 AC-12)', async () => {
    const unit = await h.unit(1);
    const { subscriptionId, id } = await decided(unit, { choice: 'CANCEL', acknowledgeActiveUsers: true });

    const held = await h.outcome(id, { outcome: 'AS_DECIDED' }).expect(409);
    expect(h.codeOf(held)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED');
    expect(h.detailsOf(held)).toEqual({ seatsInUse: 1, quantity: 0 });
    const renewal = await recorded(id, {
      outcome: 'VENDOR_REFUSED',
      note: 'The contract cannot be cancelled this year',
    });

    expect(renewal.outcomeDetail).toMatchObject({
      kind: 'VENDOR_REFUSED',
      vendorFollowUpOpen: true,
      nextSubscriptionId: null,
      realisedSavings: null,
    });
    const { rows } = await h.ctx.sql.query(`SELECT 1 FROM subscriptions WHERE renewed_from_id = $1`, [subscriptionId]);
    expect(rows).toHaveLength(0);
  });

  it('records one outcome and one new period when two IT Admins record at the same time (QĐ-16, US-11-03 AC-4)', async () => {
    const unit = await h.unit(1);
    const { subscriptionId, id } = await decided(unit, { choice: 'RENEW' });

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
    const unit = await h.unit(0);
    const { id } = await decided(unit, { choice: 'RENEW' });

    expect((await h.outcome(id, { outcome: 'UNCONFIRMED' }, h.boss.account)).status).toBe(403);
    expect((await h.outcome(id, { outcome: 'UNCONFIRMED' }, h.finance)).status).toBe(403);
    await h.outcome(id, { outcome: 'UNCONFIRMED' }).expect(200);
  });
});
