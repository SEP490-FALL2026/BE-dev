import type { ApiAccount } from '../../support/api-accounts';
import { StatusHarness } from '../../support/status-harness';
import type { Unit } from '../../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.5 (F67, rows 41, 47 and 48 of the table of events): the loop between Finance and the
 * head of the department about the money of a request is told in the inbox through the status projector, from the Audit Trail: the review
 * of Finance opens (Finance and the head), Finance gives the request back (the head, with Finance's reason) or asks for a budget to be
 * made (the head), and the version it waited for ends (Finance). Only ids, codes and Finance's own reason: never an amount, a figure of
 * the budget, a code of the check or an opinion. Each is told once, however often the projection passes.
 */
const h = new StatusHarness();
const M = 1_000_000;

describe('the notices of the loop between Finance and the head (integration, real PostgreSQL)', () => {
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

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-FN${counter}`);
  };
  /** A request of 45 million of a budget with 40 left: the check sends it to Finance. Whoever made the check is not told of it. */
  const inReview = async (u: Unit, by: ApiAccount = u.head.account) => {
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M, percent: 95 });
    const id = await h.paidRequest(u, plan, { amount: 45 * M });
    await h.route(id, by);

    return id;
  };
  /** What a person was told about the request, by code: recipient and parameters. */
  const told = async (requestId: string, code: string) =>
    (await h.noticesAbout(requestId))
      .filter((row) => row.code === code)
      .map((row) => ({ to: row.recipient_employee_id, params: row.params }));

  it('tells Finance and the head that the review of Finance is open, and nobody when the request goes straight to the approver', async () => {
    const u = await unit();
    // The check is made by the requester's side, not by the head: the head is told of what somebody else did (an actor is never told of their own act).
    const id = await inReview(u, u.member.account);
    const calm = await unit();
    await h.budgetFor(calm, { total: 100 * M, percent: 95 });
    const ordinary = await h.paidRequest(calm, plan, { amount: 5 * M });
    await h.route(ordinary, calm.head.account);

    await h.project();

    const notices = await told(id, 'REQUEST_FINANCE_REVIEW_OPENED');
    expect(notices.map((notice) => notice.to).sort()).toEqual([h.finance.employeeId, u.head.employeeId].sort());
    for (const notice of notices) expect(notice.params).toEqual({ requestId: id, stepKind: 'FINANCE_REVIEW' });
    expect(await told(ordinary, 'REQUEST_FINANCE_REVIEW_OPENED')).toEqual([]);
  });

  it('tells the head, only, that Finance gave the request back, with the reason Finance wrote and no figure', async () => {
    const u = await unit();
    const id = await inReview(u);
    await h
      .completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'Short by 5 million: reduce the scope' })
      .expect(200);

    await h.project();

    expect(await told(id, 'REQUEST_RETURNED_BY_FINANCE')).toEqual([
      { to: u.head.employeeId, params: { requestId: id, reason: 'Short by 5 million: reduce the scope' } },
    ]);
    expect(
      (await h.noticesAbout(id)).filter(
        (row) => row.code === 'REQUEST_RETURNED_BY_FINANCE' && row.recipient_employee_id === h.finance.employeeId,
      ),
    ).toEqual([]);
  });

  it('tells the head that the request waits for a budget, naming the Cost Center and the year, and tells Finance when that version ends', async () => {
    const u = await unit();
    const id = await h.paidRequest(u, plan, { amount: 30 * M });
    await h.route(id, u.head.account);
    await h.completeReview(id, { outcome: 'NEEDS_BUDGET', reason: 'Make the budget of the year' }).expect(200);
    const proposal = await h.budgetProposed(
      u.head,
      u.department.unitId,
      [h.line({ windowFrom: `${h.year}-12-01`, windowTo: `${h.year}-12-31`, quoteValidUntil: undefined })],
      h.year,
    );
    const version = await h.built(proposal.id, { base: h.money(100 * M), reserve: h.money(0) });
    await h.sendVersion(version.id).expect(200);
    await h
      .decideVersion(version.id, { decision: 'REJECT', reason: 'Too high for the year' }, h.boss.account)
      .expect(200);

    await h.project();

    expect(await told(id, 'REQUEST_AWAITING_BUDGET')).toEqual([
      { to: u.head.employeeId, params: { requestId: id, costCenterId: u.department.unitId, year: h.year } },
    ]);
    expect(await told(id, 'REQUEST_BUDGET_VERSION_ENDED')).toEqual([
      {
        to: h.finance.employeeId,
        params: {
          requestId: id,
          versionId: version.id,
          costCenterId: u.department.unitId,
          year: h.year,
          decision: 'REJECTED',
        },
      },
    ]);
  });

  it('tells each of them once: a second pass of the projection writes nothing, and the inbox shows the notice with its parameters', async () => {
    const u = await unit();
    const id = await inReview(u);
    await h.completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'Carry it to the next year' }).expect(200);
    await h.project();
    const count = await h.noticeCount();

    await h.project();
    await h.project();

    expect(await h.noticeCount()).toBe(count);
    const items = h.dataOf<{
      items: Array<{ code: string; params: Record<string, unknown>; subject: { id: string } | null }>;
    }>(await h.inbox(u.head.account, { pageSize: 50 }).expect(200)).items;
    expect(items.filter((item) => item.code === 'REQUEST_RETURNED_BY_FINANCE')).toEqual([
      expect.objectContaining({
        params: { requestId: id, reason: 'Carry it to the next year' },
        subject: { type: 'ACCESS_REQUEST', id },
      }),
    ]);
  });

  it('never carries an amount, a figure of the budget, a code of the check or an opinion in what it tells', async () => {
    const u = await unit();
    const id = await inReview(u);
    await h
      .completeReview(id, {
        outcome: 'ASSESSED',
        opinion: 'An exception worth 5 million',
        direction: 'RECOMMEND_OVERRIDE',
      })
      .expect(200);
    await h.project();

    const everything = JSON.stringify(await h.noticesAbout(id));

    expect(everything).not.toMatch(/INSUFFICIENT_BUDGET|HIGH_VALUE|RECOMMEND_OVERRIDE|worth 5 million|45000000/);
  });
});
