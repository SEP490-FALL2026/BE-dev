import { Client } from 'pg';
import { BlockAnnouncementService } from '../../../src/modules/personnel/departure-deadline/block-announcement.service';
import { Barrier } from '../../support/concurrency-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
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

      const today = h.today();
      await h.recordedCase(employee, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: today });

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
      // The pass catches the failure of each case it works, so a deadlock whose victim is the block moment shows only here.
      if (blockOutcome.status === 'fulfilled') expect(blockOutcome.value.failed).toBe(0);
      expect(grantOutcome.status).toBe('fulfilled');
      if (grantOutcome.status === 'fulfilled') {
        expect([201, 409, 422]).toContain(grantOutcome.value.status);
        expect(grantOutcome.value.status).not.toBe(500);
        expect(grantOutcome.value.status).not.toBe(503);
      }
    }
  });

  it('takes the task of a queued grant after the employee, as a departure that blocks the person does: the other holds the employee and asks for the task, with no deadlock', async () => {
    const unit = await h.departmentWithHead('P-GCLM');
    await h.budgetFor(unit, { total: 500 * M, held: 0, spent: 0 });
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    seq += 1;
    const employee = await h.worker(unit.department, `GCLM-E${seq}`);
    const sent = await h.sent(employee, planId, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
    await h.setPayments(sent.id, { amount: 5 * M });
    await h.sendOn([sent.id], unit.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const granted = await h.grant({ requestId: sent.id, subscriptionId }).expect(201);
    const taskId = h.dataOf<{ task: { id: string } }>(granted).task.id;
    await h.unclaimed(taskId);

    const departure = new Client({ connectionString: h.ctx.database.url });
    await departure.connect();
    try {
      // The departure of the block moment: it holds the employee first.
      await departure.query('BEGIN');
      await departure.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employee.employeeId]);

      const claiming = h.claim(taskId).then((response) => response);
      await waitForLockWaiters(h.ctx.sql, 1);
      // It then reaches the task of the grant (to cancel it). The claim waits for the employee and holds nothing of the task, so this is granted at once.
      await departure.query('SELECT id FROM provisioning_tasks WHERE id = $1 FOR UPDATE', [taskId]);
      await departure.query('COMMIT');
      const claimed = await claiming;

      expect(claimed.status).toBe(200);
    } finally {
      await departure.query('ROLLBACK').catch(() => undefined);
      await departure.end();
    }
  });
});
