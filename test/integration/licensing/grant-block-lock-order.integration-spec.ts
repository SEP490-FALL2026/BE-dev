import { addDays } from '../../../src/core/business-date';
import { BlockAnnouncementService } from '../../../src/modules/personnel/departure-deadline/block-announcement.service';
import { Barrier } from '../../support/concurrency-harness';
import { OffboardingHarness } from '../../support/offboarding-harness';

const h = new OffboardingHarness();
const M = 1_000_000;

const isDeadlockError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: unknown }).code === '40P01';
};

describe('Personal seat grant and departure block moment lock order (integration, real PostgreSQL)', () => {
  let planId: string;
  let subscriptionId: string;
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(60, 'K2');
    planId = await h.planOf(subscriptionId);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  beforeEach(async () => {
    await h.ctx.sql.query(
      `UPDATE offboarding_cases SET block_announced_at = now() WHERE state <> 'CANCELLED' AND block_announced_at IS NULL`,
    );
  });

  it('never deadlocks (0 x 40P01) across 20 concurrent personal grant and block-announcement runs for the same employee', async () => {
    const unit = await h.departmentWithHead('P-GBLO');
    await h.budgetFor(unit, { total: 500 * M, held: 0, spent: 0 });
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const announcement = h.ctx.app.get(BlockAnnouncementService, { strict: false });

    for (let i = 0; i < 20; i += 1) {
      seq += 1;
      const employee = await h.worker(unit.department, `GBLO-E${seq}`);
      const sent = await h.sent(employee, planId, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      await h.setPayments(sent.id, { amount: 5 * M });
      await h.sendOn([sent.id], unit.head.account).expect(201);
      await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

      await h.recordedCase(employee);
      const today = h.today();
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET block_at = $1, block_announced_at = NULL WHERE employee_id = $2 AND state <> 'CANCELLED'`,
        [new Date(`${addDays(today, -1)}T00:00:00Z`), employee.employeeId],
      );

      const barrier = new Barrier(2);
      const grantTask = (async () => {
        await barrier.wait();
        return h.grant({ requestId: sent.id, subscriptionId });
      })();
      const blockTask = (async () => {
        await barrier.wait();
        return announcement.announce(new Date(`${today}T12:00:00Z`));
      })();

      const [grantOutcome, blockOutcome] = await Promise.allSettled([grantTask, blockTask]);
      expect(blockOutcome.status).toBe('fulfilled');
      if (blockOutcome.status === 'rejected') expect(isDeadlockError(blockOutcome.reason)).toBe(false);
      expect(grantOutcome.status).toBe('fulfilled');
      if (grantOutcome.status === 'fulfilled') {
        expect([201, 409, 422]).toContain(grantOutcome.value.status);
        expect(grantOutcome.value.status).not.toBe(500);
        expect(grantOutcome.value.status).not.toBe(503);
      }
    }
  });
});
