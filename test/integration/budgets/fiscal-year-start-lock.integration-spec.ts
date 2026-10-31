import { FISCAL_KEY, FiscalYearStartLockHarness } from '../../support/fiscal-year-start-lock-harness';

const h = new FiscalYearStartLockHarness();

/**
 * `b01-fiscal-year-start-lock`: once any budget version exists the Super Admin can no longer change the month the fiscal year begins
 * (`US-01-04` AC-8). A refusal changes nothing and records nothing; the same month again is not a change; every other parameter
 * still changes.
 */
describe('the lock of the month the fiscal year begins (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('lets the month change while no budget version exists, and records each change', async () => {
    expect(await h.budgetRows('budget_versions')).toBe(0);

    await h.setParameter(FISCAL_KEY, 4).expect(200);
    await h.setParameter(FISCAL_KEY, 1).expect(200);

    expect((await h.currentRow())?.value).toBe(1);
    expect(await h.changeAudits()).toBe(2);
  });

  describe('with a budget version that is only a draft', () => {
    let beforeRefusal: { value: unknown; validFrom: Date } | null;
    let rowsBefore: number;
    let auditsBefore: number;

    beforeAll(async () => {
      const proposal = await h.waitingProposal();
      const version = await h.built(proposal.id);
      expect(version.state).toBe('DRAFT');
      beforeRefusal = await h.currentRow();
      rowsBefore = await h.valueRows();
      auditsBefore = await h.changeAudits();
    });

    it('refuses the change with 409 PARAMETER.LOCKED and names the key and the reason', async () => {
      const refused = await h.setParameter(FISCAL_KEY, 4).expect(409);

      expect(h.codeOf(refused)).toBe('PARAMETER.LOCKED');
      expect((refused.body as { error: { details: unknown } }).error.details).toEqual({
        key: FISCAL_KEY,
        reason: 'BUDGET_VERSION_EXISTS',
      });
    });

    it('leaves the value, its history and the audit trail exactly as they were', async () => {
      await h.setParameter(FISCAL_KEY, 7).expect(409);

      expect(await h.currentRow()).toEqual(beforeRefusal);
      expect(await h.valueRows()).toBe(rowsBefore);
      expect(await h.changeAudits()).toBe(auditsBefore);
    });

    it('still refuses a value outside the domain as invalid, before the lock is asked', async () => {
      const invalid = await h.setParameter(FISCAL_KEY, 13).expect(422);

      expect(h.codeOf(invalid)).toBe('PARAMETER.VALUE_INVALID');
    });

    it('treats the month it already has as no change: 200, nothing recorded', async () => {
      await h.setParameter(FISCAL_KEY, 1).expect(200);

      expect(await h.currentRow()).toEqual(beforeRefusal);
      expect(await h.valueRows()).toBe(rowsBefore);
      expect(await h.changeAudits()).toBe(auditsBefore);
    });

    it('does not lock the other parameters', async () => {
      await h.setParameter('APPROVAL_SLA_WORKING_DAYS', 3).expect(200);

      expect((await h.currentRow('APPROVAL_SLA_WORKING_DAYS'))?.value).toBe(3);
    });
  });

  it('keeps the lock when a version has been sent and made current', async () => {
    const proposal = await h.waitingProposal();
    await h.current(proposal.id);

    expect(h.codeOf(await h.setParameter(FISCAL_KEY, 4).expect(409))).toBe('PARAMETER.LOCKED');
    expect((await h.currentRow())?.value).toBe(1);
  });
});
