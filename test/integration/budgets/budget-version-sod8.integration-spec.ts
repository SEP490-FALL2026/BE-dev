import { AccountStatusService } from '../../../src/modules/identity-access/accounts/app-users/account-status.service';
import type { ApiAccount } from '../../support/api-accounts';
import { principalOf } from '../../support/builders/account.builder';
import type { Person } from '../../support/request-harness';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();

/**
 * SoD-8 over time (QĐ-93b, BR-MF4-04): the Finance person who built and sent a version is later made the spending approver; the version
 * that now waits for them is still refused to them by the decision itself (`BUDGET.OWN_VERSION`). Restored after the review of 09/11/2026
 * (G23-10): the case lived in the suite of the retired Finance review of requests and was deleted with it, though the rule still holds.
 */
describe('the Finance person who built a version does not decide it (SoD-8, integration, real PostgreSQL)', () => {
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async () => {
    counter += 1;

    return h.departmentWithHead(`P-SOD8${counter}`);
  };
  const status = () => h.ctx.app.get(AccountStatusService, { strict: false });
  const financeBecomesApprover = async (finance: ApiAccount): Promise<Person> => {
    const person: Person = { employeeId: finance.employeeId, account: finance };
    await h.setRole('SPENDING_APPROVER', person);

    return person;
  };
  const restore = async (finance: ApiAccount): Promise<void> => {
    await h.setRole('SPENDING_APPROVER', h.boss);
    await status().changeRole(await principalOf(h.ctx, h.admin), finance.appUserId, 'FINANCE');
  };

  it('BR-MF4-04: refuses the decision of a version to the person who built and sent it (BUDGET.OWN_VERSION)', async () => {
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
