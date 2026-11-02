import { AccountStatusService } from '../../../src/modules/identity-access/accounts/app-users/account-status.service';
import type { ApiAccount } from '../../support/api-accounts';
import { principalOf } from '../../support/builders/account.builder';
import type { Person } from '../../support/request-harness';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

/**
 * SoD-8 over time (QĐ-93b): the roles cannot be held together, but they can change hands. A Finance person who reviewed a request,
 * or built and sent a version, is taken off FINANCE and made the spending approver: the step or the version that now waits for
 * them is still refused to them, by the decision itself (`SPEND.REVIEWER_IS_APPROVER`, `BUDGET.OWN_VERSION`). Through the role
 * routes of the Super Admin (revoke, then grant), on real PostgreSQL.
 */
describe('the reviewer of Finance does not decide what they reviewed or sent (integration, real PostgreSQL)', () => {
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

  const unit = async () => {
    counter += 1;

    return h.departmentWithHead(`P-SEP${counter}`);
  };
  const status = () => h.ctx.app.get(AccountStatusService, { strict: false });
  /** The Super Admin moves the person from FINANCE to the spending approver, the way the routes do (revoke, then grant). */
  const financeBecomesApprover = async (finance: ApiAccount): Promise<Person> => {
    const actor = await principalOf(h.ctx, h.admin);
    await status().revokeRole(actor, finance.appUserId, 'FINANCE');
    const person: Person = { employeeId: finance.employeeId, account: finance };
    await h.setRole('SPENDING_APPROVER', person);

    return person;
  };
  /** And back: the boss is the spending approver again, the person holds FINANCE again. */
  const restore = async (finance: ApiAccount): Promise<void> => {
    await h.setRole('SPENDING_APPROVER', h.boss);
    await status().grantRole(await principalOf(h.ctx, h.admin), finance.appUserId, 'FINANCE');
  };

  it('refuses the spend decision to the person who completed the review of the request (SPEND.REVIEWER_IS_APPROVER)', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
    const id = await h.paidRequest(u, plan, { amount: 45 * M });
    await h.route(id, u.head.account);
    await h
      .completeReview(id, { outcome: 'ASSESSED', opinion: 'Over by 5 million', direction: 'RECOMMEND_OVERRIDE' })
      .expect(200);
    const finance = h.finance;

    await financeBecomesApprover(finance);
    try {
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: finance.employeeId }),
      ]);

      const refused = await h
        .decideSpend(id, { decision: 'APPROVE', override: { reason: 'Mended next month', years: [h.year] } }, finance)
        .expect(409);

      expect(h.codeOf(refused)).toBe('SPEND.REVIEWER_IS_APPROVER');
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
    } finally {
      await restore(finance);
    }
  });

  it('refuses the decision of a version to the person who built and sent it (BUDGET.OWN_VERSION)', async () => {
    const u = await unit();
    const proposal = await h.budgetProposed(u.head, u.department.unitId, undefined, h.next);
    const version = await h.built(proposal.id);
    await h.sendVersion(version.id).expect(200);
    const finance = h.finance;

    await financeBecomesApprover(finance);
    try {
      const refused = await h.decideVersion(version.id, { decision: 'APPROVE' }, finance).expect(403);

      expect(h.codeOf(refused)).toBe('BUDGET.OWN_VERSION');
      const { rows } = await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_versions WHERE id = $1`, [
        version.id,
      ]);
      expect(rows[0].state).toBe('SENT');
    } finally {
      await restore(finance);
    }
  });
});
