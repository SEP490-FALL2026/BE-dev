import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { GrantCancelCause } from '../../../src/modules/licensing/public/licensing-open-grants.types';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/**
 * F29 (`QĐ-89b`, spec E): the IT Admin closes the part of a request not yet granted when its beneficiary was transferred to another
 * department. Any task of the grant that is open, whatever its state (queued, waiting for its retry, failed or being worked), is
 * cancelled with its assignment only with the evidence that the IT Admin confirmed the check with the vendor: without it the answer
 * is `EVIDENCE_REQUIRED` and nothing changes. A task that is done is never cancelled, the seat is real. The task keeps the reason
 * `BENEFICIARY_TRANSFERRED`. Called through the facade the module of requests calls, in a transaction, on real PostgreSQL.
 */
describe('cancelling the grant of a request for a beneficiary who was transferred (integration, F29)', () => {
  let subscriptionId: string;
  let planId: string;
  let counter = 0;

  const actor = (): AuthenticatedPrincipal => ({
    subject: h.it1.appUserId,
    appUserId: h.it1.appUserId,
    sessionId: 'test',
    employeeId: h.it1.employeeId,
    directRoles: ['IT_ADMIN'],
    roles: ['IT_ADMIN'],
  });
  const cancel = (requestId: string, cause: GrantCancelCause, evidence?: string) =>
    h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingApi).cancelGrantOfRequest(tx, actor(), {
        organizationId: h.seed.organizationId,
        requestId,
        now: new Date(),
        cause,
        ...(evidence === undefined ? {} : { evidence }),
      }),
    );
  const granted = async () => h.granted(await h.person(`E-TR${(counter += 1)}`), planId, { subscriptionId });
  const VENDOR_CHECKED = 'The vendor confirmed the invitation was taken back';
  const taskRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ status: string; close_reason: string | null; cancelled_at: Date | null }>(
        `SELECT t.status::text AS status, t.close_reason, a.cancelled_at
           FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id WHERE t.id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    await h.start();
    subscriptionId = await h.subscription(10, 'K2');
    planId = await h.planOf(subscriptionId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('needs the confirmation of the check with the vendor even for a task nobody has worked, and then cancels it with its assignment so the seat is free again', async () => {
    const before = await h.freeSeats(subscriptionId);
    const task = await granted();
    expect(await h.freeSeats(subscriptionId)).toBe((before ?? 0) - 1);

    expect(await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED')).toEqual({ status: 'EVIDENCE_REQUIRED' });
    expect(await taskRow(task.id)).toMatchObject({ status: 'QUEUED', close_reason: null, cancelled_at: null });
    expect(await h.freeSeats(subscriptionId)).toBe((before ?? 0) - 1);

    const answer = await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED', VENDOR_CHECKED);

    expect(answer).toEqual({ status: 'CANCELLED', taskId: task.id, taskStatus: 'QUEUED' });
    expect(await taskRow(task.id)).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_TRANSFERRED' });
    expect((await taskRow(task.id)).cancelled_at).not.toBeNull();
    expect(await h.freeSeats(subscriptionId)).toBe(before);
    const event = (await h.auditEvents('ProvisioningTask', task.id)).find(
      (one) => one.action === 'PROVISIONING_TASK.CANCELLED',
    );
    expect(event?.after).toMatchObject({
      status: 'CANCELLED',
      closeReason: 'BENEFICIARY_TRANSFERRED',
      evidence: VENDOR_CHECKED,
    });
  });

  it('keeps the withdrawal of the requester and the departure of the beneficiary as before: a task nobody has worked needs no evidence', async () => {
    const withdrawn = await granted();
    const left = await granted();

    expect(await cancel(withdrawn.requestId, 'REQUESTER_WITHDREW')).toMatchObject({ status: 'CANCELLED' });
    expect(await cancel(left.requestId, 'BENEFICIARY_LEFT')).toMatchObject({ status: 'CANCELLED' });
    expect(await taskRow(withdrawn.id)).toMatchObject({ status: 'CANCELLED', close_reason: 'REQUESTER_WITHDREW' });
    expect(await taskRow(left.id)).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_LEFT' });
  });

  it('needs the confirmation also for a task waiting for its next try, and cancels it with it', async () => {
    const task = await granted();
    // A task waiting for its next try, reached the way the connector reaches it: a temporary failure with retries left.
    await h.makeConnector(task.id);
    expect((await h.recordFailure(task.id, 'TRANSIENT')).status).toBe('RETRY_SCHEDULED');

    expect(await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED')).toEqual({ status: 'EVIDENCE_REQUIRED' });
    expect(await taskRow(task.id)).toMatchObject({ status: 'RETRY_SCHEDULED', close_reason: null });

    expect(await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED', VENDOR_CHECKED)).toMatchObject({
      status: 'CANCELLED',
      taskStatus: 'RETRY_SCHEDULED',
    });
    expect(await taskRow(task.id)).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_TRANSFERRED' });
  });

  it('needs the confirmation for a task that failed, where a withdrawal would leave it to the IT Admin', async () => {
    const task = await granted();
    await h.claim(task.id).expect(200);
    await h.fail(task.id, { reason: 'could not be done' }).expect(200);

    expect(await cancel(task.requestId, 'REQUESTER_WITHDREW')).toEqual({ status: 'FAILED', taskId: task.id });
    expect(await taskRow(task.id)).toMatchObject({ status: 'FAILED' });

    expect(await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED')).toEqual({ status: 'EVIDENCE_REQUIRED' });
    expect(await taskRow(task.id)).toMatchObject({ status: 'FAILED', close_reason: null });

    expect(await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED', VENDOR_CHECKED)).toMatchObject({
      status: 'CANCELLED',
      taskStatus: 'FAILED',
    });
    expect(await taskRow(task.id)).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_TRANSFERRED' });
  });

  it('cancels a task being worked only with the evidence that the work was undone, and keeps it in the audit event', async () => {
    const task = await granted();
    await h.claim(task.id).expect(200);

    expect(await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED')).toEqual({ status: 'EVIDENCE_REQUIRED' });
    expect(await taskRow(task.id)).toMatchObject({ status: 'IN_PROGRESS', close_reason: null });

    const answer = await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED', VENDOR_CHECKED);

    expect(answer).toMatchObject({ status: 'CANCELLED', taskStatus: 'IN_PROGRESS' });
    expect(await taskRow(task.id)).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_TRANSFERRED' });
    const event = (await h.auditEvents('ProvisioningTask', task.id)).find(
      (one) => one.action === 'PROVISIONING_TASK.CANCELLED',
    );
    expect(event?.after).toMatchObject({
      status: 'CANCELLED',
      closeReason: 'BENEFICIARY_TRANSFERRED',
      evidence: VENDOR_CHECKED,
    });
  });

  it('never cancels a grant that is done: the person has a real entitlement, and the answer says so', async () => {
    const task = await granted();
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'đã thêm tài khoản' }).expect(200);

    const answer = await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED', 'any evidence');

    expect(answer).toEqual({ status: 'COMPLETED', assignmentId: task.assignmentId });
    expect(await taskRow(task.id)).toMatchObject({ status: 'COMPLETED', cancelled_at: null });
  });

  it('answers ENDED for a task that is already cancelled, and changes nothing', async () => {
    const task = await granted();
    await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED', VENDOR_CHECKED);

    expect(await cancel(task.requestId, 'BENEFICIARY_TRANSFERRED')).toEqual({ status: 'ENDED' });
    expect(await taskRow(task.id)).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_TRANSFERRED' });
  });
});
