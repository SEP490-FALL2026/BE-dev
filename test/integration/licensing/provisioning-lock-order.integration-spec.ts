import { Client } from 'pg';
import { waitForLockWaiters } from '../../support/lock-wait';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/**
 * F25 (spec E): one order of locks, so the grant of one person of a request for a group and the closing of the failed grant of another
 * person of it, on the same subscription, never wait for each other in a circle. The grant takes the request and then the subscription;
 * closing a failed grant takes the task, the request (the outcome) and only then the subscription and the assignment. The two persons
 * of the request share one lock in the gate of the test, which stands for the lock of the request row. The order is forced with held
 * locks and lock waits (`waitForLockWaiters`), never a sleep: the closing waits for the assignment held in another connection, the grant
 * queues behind it, and when the assignment is released both must finish. With the subscription taken before the request in the
 * closing, the closing holds the subscription and waits for the request while the grant holds the request and waits for the
 * subscription: the database aborts one of them and the test fails.
 */
describe('the grant and the closing of a failed grant of one request for a group, on one subscription (integration, F25)', () => {
  let holder: Client;

  beforeAll(async () => {
    await h.start();
    holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
  }, 240000);

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    await holder?.end();
    await h.stop();
  });

  it('both finish: the closing takes the request before the subscription and the assignment, as the grant takes the request before the subscription', async () => {
    const subscriptionId = await h.subscription(5, 'K2');
    const planId = await h.planOf(subscriptionId);
    const first = await h.person('E-LO1');
    const second = await h.person('E-LO2');
    // The grant of the first person failed and waits for the decision of the IT Admin.
    const failed = await h.granted(first, planId, { subscriptionId });
    await h.claim(failed.id).expect(200);
    await h.fail(failed.id, { reason: 'could not be done' }).expect(200);
    // The second person of the same request for a group is granted while the first is closed.
    const nextRequestId = h.gate.grantable(second, planId);
    h.gate.shareLock('request-for-a-group', failed.requestId, nextRequestId);
    await holder.query('BEGIN');
    await holder.query(`SELECT id FROM license_assignments WHERE id = $1 FOR UPDATE`, [failed.assignmentId]);

    const closing = h
      .closeFailed(failed.id, { reason: 'the work is not wanted any more' })
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    const granting = h.grant({ requestId: nextRequestId, subscriptionId }).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('COMMIT');
    const closed = await closing;
    const granted = await granting;

    expect([closed.status, granted.status]).toEqual([200, 201]);
    expect(h.gate.outcomes).toContainEqual({ requestId: failed.requestId, outcome: 'FAILED' });
    const assignments = await h.ctx.sql.query<{ employee_id: string; failed_at: Date | null }>(
      `SELECT employee_id, failed_at FROM license_assignments WHERE subscription_id = $1`,
      [subscriptionId],
    );
    expect(assignments.rows.find((row) => row.employee_id === first)?.failed_at).not.toBeNull();
    expect(assignments.rows.find((row) => row.employee_id === second)?.failed_at).toBeNull();
  });
});
