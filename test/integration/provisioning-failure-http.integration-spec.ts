import { randomUUID } from 'node:crypto';
import {
  ProvisioningTaskNotConnectorError,
  ProvisioningTaskNotFoundError,
  ProvisioningTaskStateError,
} from '../../src/modules/licensing/licensing.errors';
import { ProvisioningHarness, type TaskWire } from '../support/provisioning-harness';

const h = new ProvisioningHarness();
const MINUTE = 60_000;

describe('what a failed try of the connector leads to, over HTTP (integration, real PostgreSQL)', () => {
  let e5: string;
  let e7: string;

  const task = async (id: string): Promise<TaskWire> =>
    h.dataOf<{ task: TaskWire }>(await h.getTask(id).expect(200)).task;
  const connectorTask = async (employeeId = e5, quantity = 5) => {
    const subscriptionId = await h.subscription(quantity, 'K2');
    const made = await h.granted(employeeId, await h.planOf(subscriptionId), { subscriptionId });
    await h.makeConnector(made.id);

    return { subscriptionId, id: made.id, assignmentId: made.assignmentId };
  };
  const assignment = async (id: string) =>
    (
      await h.ctx.sql.query<{ valid_until: string | null; failed_at: string | null }>(
        `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until, failed_at FROM license_assignments WHERE id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    await h.start();
    const designer = await h.jobTitle('Designer');
    const a1Employee = await h.person('E-A1');
    await h.account('E-A1', a1Employee, ['IT_ADMIN']);
    await h.department('P-DES', a1Employee);
    e5 = await h.member('P-DES', 'E-5', designer);
    e7 = await h.member('P-DES', 'E-7', designer);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-07-04 AC-1: a temporary failure waits for its next try, longer each time, and shows the tries over the most allowed', async () => {
    const { id, subscriptionId } = await connectorTask(e5, 1);
    const first = new Date();
    const second = new Date(first.getTime() + 6 * MINUTE);

    const one = await h.recordFailure(id, 'TRANSIENT', 'provider answered slowly', first);
    expect(one).toMatchObject({ status: 'RETRY_SCHEDULED', attempts: 1 });
    expect(one.nextRetryAt?.getTime()).toBe(first.getTime() + 5 * MINUTE);
    const two = await h.recordFailure(id, 'TRANSIENT', 'provider answered slowly again', second);
    expect(two.nextRetryAt?.getTime()).toBe(second.getTime() + 10 * MINUTE);

    expect(await task(id)).toMatchObject({
      status: 'RETRY_SCHEDULED',
      failureKind: 'TRANSIENT',
      attempts: 2,
      maxAttempts: 4,
      lastError: 'provider answered slowly again',
      availableDecisions: [],
    });
    expect(await h.freeSeats(subscriptionId)).toBe(0);
  });

  it('records each failure in the audit trail as the system, with the kind and the tries, and never the technical detail', async () => {
    const { id } = await connectorTask();
    await h.recordFailure(id, 'TRANSIENT', 'secret-detail-123');

    const events = (await h.auditEvents('ProvisioningTask', id)).filter((event) =>
      event.action.endsWith('FAILURE_RECORDED'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor_app_user_id: null,
      before: { status: 'QUEUED', attempts: 0 },
      after: { status: 'RETRY_SCHEDULED', failureKind: 'TRANSIENT', attempts: 1, retriesExhausted: false },
    });
    expect(JSON.stringify(events)).not.toContain('secret-detail-123');
  });

  it('LD-08: keeps at most 1000 characters of a connector error, the first ones, and a shorter one whole', async () => {
    // The limit is the one of a failure reason a person types (`FAILURE_REASON_MAX_LENGTH`), written out here.
    const exact = 'e'.repeat(999) + 'X';
    const { id: whole } = await connectorTask(e5, 1);
    await h.recordFailure(whole, 'PERMANENT', exact);
    const long = `${'a'.repeat(1000)}${'b'.repeat(9000)}`;
    const { id: cut } = await connectorTask(e5, 1);
    await h.recordFailure(cut, 'PERMANENT', `  ${long}  `);

    expect((await task(whole)).lastError).toBe(exact);
    expect((await task(cut)).lastError).toBe('a'.repeat(1000));
  });

  it('US-07-04 AC-2: a permanent failure is not tried again; the IT Admin has a decision to make, the seat stays taken and nothing is closed', async () => {
    const { id, subscriptionId, assignmentId } = await connectorTask(e5, 1);

    const outcome = await h.recordFailure(id, 'PERMANENT', 'email already exists in the organization');

    expect(outcome).toEqual({ status: 'FAILED', attempts: 1, nextRetryAt: null });
    expect(await task(id)).toMatchObject({
      status: 'FAILED',
      failureKind: 'PERMANENT',
      nextRetryAt: null,
      lastError: 'email already exists in the organization',
      availableDecisions: ['RETRY', 'HAND_OFF', 'CLOSE_FAILED'],
      closedBy: null,
    });
    expect(await h.freeSeats(subscriptionId)).toBe(0);
    expect(await assignment(assignmentId)).toEqual({ valid_until: null, failed_at: null });
    expect((await h.auditEvents('ProvisioningTask', id)).map((event) => event.action)).not.toContain(
      'PROVISIONING_TASK.CLOSED_FAILED',
    );
  });

  it.each(['AUTHENTICATION', 'QUOTA_EXCEEDED'] as const)(
    'US-07-04 AC-3, AC-4: a %s failure is not tried again, and its kind is kept for the ones who act on it',
    async (kind) => {
      const { id } = await connectorTask();

      const outcome = await h.recordFailure(id, kind);

      expect(outcome.status).toBe('FAILED');
      expect(await task(id)).toMatchObject({ status: 'FAILED', failureKind: kind, nextRetryAt: null });
      const events = await h.auditEvents('ProvisioningTask', id);
      expect(events.at(-1)).toMatchObject({ after: { failureKind: kind } });
    },
  );

  it('US-07-04 AC-7: when the last try fails too, the task is handled as a permanent failure, by the number the configuration gives', async () => {
    await h.setParameter('PROVISIONING_RETRY_COUNT', 2).expect(200);
    try {
      const { id } = await connectorTask();

      expect((await h.recordFailure(id, 'TRANSIENT')).status).toBe('RETRY_SCHEDULED');
      expect((await h.recordFailure(id, 'TRANSIENT')).status).toBe('RETRY_SCHEDULED');
      const last = await h.recordFailure(id, 'TRANSIENT');

      expect(last).toEqual({ status: 'FAILED', attempts: 3, nextRetryAt: null });
      expect(await task(id)).toMatchObject({
        status: 'FAILED',
        failureKind: 'TRANSIENT',
        attempts: 3,
        maxAttempts: 3,
        availableDecisions: ['RETRY', 'HAND_OFF', 'CLOSE_FAILED'],
      });
      expect((await h.auditEvents('ProvisioningTask', id)).at(-1)).toMatchObject({
        after: { status: 'FAILED', retriesExhausted: true },
      });
    } finally {
      await h.setParameter('PROVISIONING_RETRY_COUNT', 3).expect(200);
    }
  });

  it('with no retry allowed at all, the first temporary failure already needs a decision', async () => {
    await h.setParameter('PROVISIONING_RETRY_COUNT', 0).expect(200);
    try {
      const { id } = await connectorTask();

      expect((await h.recordFailure(id, 'TRANSIENT')).status).toBe('FAILED');
      expect(await task(id)).toMatchObject({ maxAttempts: 1, attempts: 1 });
    } finally {
      await h.setParameter('PROVISIONING_RETRY_COUNT', 3).expect(200);
    }
  });

  it('US-01-04 AC-13: the most tries are fixed when the task is made, and a later change reaches only the tasks made after it', async () => {
    const early = await connectorTask(e5, 5);
    await h.setParameter('PROVISIONING_RETRY_COUNT', 1).expect(200);
    try {
      const late = await connectorTask(e7, 5);

      expect(await task(early.id)).toMatchObject({ maxAttempts: 4 });
      expect(await task(late.id)).toMatchObject({ maxAttempts: 2 });
      // The task made before the change still gets its three retries; the one made after gets one.
      for (const attempts of [1, 2, 3]) {
        expect(await h.recordFailure(early.id, 'TRANSIENT')).toMatchObject({ status: 'RETRY_SCHEDULED', attempts });
      }
      expect(await h.recordFailure(early.id, 'TRANSIENT')).toMatchObject({ status: 'FAILED', attempts: 4 });
      expect((await h.recordFailure(late.id, 'TRANSIENT')).status).toBe('RETRY_SCHEDULED');
      expect(await h.recordFailure(late.id, 'TRANSIENT')).toMatchObject({ status: 'FAILED', attempts: 2 });
      expect(await task(early.id)).toMatchObject({ maxAttempts: 4, attempts: 4 });
      expect(await task(late.id)).toMatchObject({ maxAttempts: 2, attempts: 2 });
    } finally {
      await h.setParameter('PROVISIONING_RETRY_COUNT', 3).expect(200);
    }
  });

  it('is the entry of the connector only: a task by hand, a task that does not exist and a task that is over are refused', async () => {
    const subscriptionId = await h.subscription(5, 'K2');
    const byHand = await h.granted(e7, await h.planOf(subscriptionId), { subscriptionId });
    const over = await connectorTask(e7);
    await h.recordFailure(over.id, 'PERMANENT');

    await expect(h.recordFailure(byHand.id, 'PERMANENT')).rejects.toBeInstanceOf(ProvisioningTaskNotConnectorError);
    await expect(h.recordFailure(randomUUID(), 'PERMANENT')).rejects.toBeInstanceOf(ProvisioningTaskNotFoundError);
    await expect(h.recordFailure(over.id, 'PERMANENT')).rejects.toEqual(new ProvisioningTaskStateError('NOT_RUNNING'));
    expect((await task(byHand.id)).status).toBe('QUEUED');
  });

  it('shows a failure of a task by hand as the kind NOT_DONE, so that it goes the same way', async () => {
    const subscriptionId = await h.subscription(5, 'K2');
    const made = await h.granted(e5, await h.planOf(subscriptionId), { subscriptionId });
    await h.claim(made.id).expect(200);

    const failed = h.dataOf<{ task: TaskWire }>(
      await h.fail(made.id, { reason: 'could not be done' }).expect(200),
    ).task;

    expect(failed).toMatchObject({
      status: 'FAILED',
      failureKind: 'NOT_DONE',
      attempts: 0,
      availableDecisions: ['RETRY', 'CLOSE_FAILED'],
    });
  });
});
