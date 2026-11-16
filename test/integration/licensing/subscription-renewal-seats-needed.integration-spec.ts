import { randomUUID } from 'node:crypto';
import { AccessRequestRepo } from '../../../src/modules/requests/access-request/access-request.repo';
import { SubscriptionRenewalSeatRepo } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal-seat.repo';
import { RenewalSeatsNeededService } from '../../../src/modules/licensing/subscription-renewal/seats-needed/renewal-seats-needed.service';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();
const TODAY = '2026-11-20';
const RENEWAL_ON = '2027-01-01';

/**
 * The statements behind the seats a subscription needs for its next period (SBF-20, S20-T3), on real PostgreSQL: the seats held past
 * the renewal day, the ones that end by it, the ones not ended today and the grants of the plan that wait; and the count of the open
 * requests of a plan that licensing reads through the module of requests.
 */
describe('the seats the next period needs (integration, real PostgreSQL)', () => {
  let seats: SubscriptionRenewalSeatRepo;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    seats = h.ctx.app.get(SubscriptionRenewalSeatRepo, { strict: false });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  interface SeatColumns {
    validFrom?: string;
    validUntil?: string | null;
    expectedEndDate?: string | null;
    cancelled?: boolean;
  }

  /** A seat of a new person straight in the table, on the subscription or, with none, on the plan alone. */
  const seat = async (planId: string, subscriptionId: string | null, columns: SeatColumns = {}): Promise<string> => {
    counter += 1;
    const id = randomUUID();
    const employeeId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       SELECT $1, organization_id, $2, $2, 'STAFF', '2026-01-01', now() FROM plans WHERE id = $3`,
      [employeeId, `E-SN-${counter}`, planId],
    );
    const validFrom = columns.validFrom ?? '2026-10-05';
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, valid_until, expected_end_date,
         cancelled_at, created_by_app_user_id)
       SELECT $1, organization_id, 'PERSONAL', 'REQUEST', $2, $3, $4, $5, $5, $6, 'ACTUAL', $7, $8, $9, gen_random_uuid()
         FROM plans WHERE id = $2`,
      [
        id,
        planId,
        subscriptionId,
        employeeId,
        `sn${counter}@acme.vn`,
        validFrom,
        columns.cancelled ? validFrom : (columns.validUntil ?? null),
        columns.expectedEndDate ?? null,
        columns.cancelled ? new Date() : null,
      ],
    );

    return id;
  };

  /** The columns a status of a task must carry with it (the table says the status and its columns are the same thing). */
  const STATUS_COLUMNS: Record<string, string> = {
    QUEUED: '',
    IN_PROGRESS: ', claimed_at = now(), claimed_by_app_user_id = gen_random_uuid()',
    RETRY_SCHEDULED: ", failure_kind = 'TRANSIENT', next_retry_at = now(), attempts = 1, last_error = 'timeout'",
    COMPLETED:
      ", claimed_at = now(), claimed_by_app_user_id = gen_random_uuid(), completed_at = now(), completed_by_app_user_id = gen_random_uuid(), evidence = 'done'",
  };

  /** A task on the assignment; a revocation also has its reason, withdrawn or not (a withdrawn reason is no revocation under way). */
  const task = async (
    assignmentId: string,
    kind: 'GRANT' | 'REVOKE',
    status: keyof typeof STATUS_COLUMNS,
    withdrawnReason = false,
  ): Promise<string> => {
    const id = randomUUID();
    const revocation = kind === 'REVOKE';
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id, revocation_source,
         max_attempts, created_by_app_user_id)
       SELECT $1, organization_id, $2, $3::"ProvisioningTaskKind", 'MANUAL', 'QUEUED', $4,
              $5::"RevocationSource", 4, gen_random_uuid()
         FROM license_assignments WHERE id = $2`,
      [id, assignmentId, kind, revocation ? null : randomUUID(), revocation ? 'RETURN' : null],
    );
    // A task is claimed before it is completed: the table lets a status follow only the ones it may come from.
    const steps = status === 'COMPLETED' ? ['IN_PROGRESS', 'COMPLETED'] : status === 'QUEUED' ? [] : [status];
    for (const step of steps) {
      await h.ctx.sql.query(
        `UPDATE provisioning_tasks SET status = '${step}'::"ProvisioningTaskStatus"${STATUS_COLUMNS[step]} WHERE id = $1`,
        [id],
      );
    }
    if (revocation) {
      await h.ctx.sql.query(
        `INSERT INTO provisioning_task_reasons (id, task_id, source, decided_role, withdrawn_at, withdraw_cause)
         VALUES (gen_random_uuid(), $1, 'RETURN', 'MANAGER', ${withdrawnReason ? 'now()' : 'NULL'}, ${withdrawnReason ? "'REQUEST_WITHDRAWN'" : 'NULL'})`,
        [id],
      );
    }

    return id;
  };

  const subscription = async () => {
    const unit = await h.unit(0);
    const subscriptionId = await h.term({ ownerDepartmentId: unit.department.id });
    const planId = (
      await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId])
    ).rows[0].plan_id;

    return { subscriptionId, planId };
  };
  const factsOf = (subscriptionId: string, planId: string, countPlanWaiting = false) =>
    seats.seatsNeededFacts(subscriptionId, planId, { today: TODAY, renewalOn: RENEWAL_ON }, countPlanWaiting);

  describe('seatsNeededFacts', () => {
    it('counts the seats held past the renewal day, those that end by it and those not ended today', async () => {
      const { subscriptionId, planId } = await subscription();
      await seat(planId, subscriptionId);
      const expectedOnRenewalDay = await seat(planId, subscriptionId, { expectedEndDate: RENEWAL_ON });
      await seat(planId, subscriptionId, { expectedEndDate: '2027-01-02' });
      const untilRenewalDay = await seat(planId, subscriptionId, { validUntil: RENEWAL_ON });
      const lastDayIsRenewalDay = await seat(planId, subscriptionId, { validUntil: '2027-01-02' });
      await seat(planId, subscriptionId, { validFrom: '2027-02-01' });
      await seat(planId, subscriptionId, { validFrom: '2026-10-01', validUntil: '2026-11-10' });
      await seat(planId, subscriptionId, { cancelled: true });

      const facts = await factsOf(subscriptionId, planId);

      // The seat that ends exactly on the renewal day is not held past it (QĐ-106i(2)); one that starts later is.
      expect(facts.heldPastRenewal).toBe(3);
      expect([...facts.endingAssignmentIds].sort()).toEqual(
        [expectedOnRenewalDay, untilRenewalDay, lastDayIsRenewalDay].sort(),
      );
      // Every seat not ended today, a later start included; one ended before today and a cancelled one are not (R2-4).
      expect(facts.activeSeatsToday).toBe(6);
      expect(facts.approvedAwaitingGrant).toBe(0);
    });

    it('leaves a seat being taken back out of the seats held and the seats ending, and keeps it among the seats in effect today', async () => {
      const { subscriptionId, planId } = await subscription();
      await seat(planId, subscriptionId);
      const revoked = await seat(planId, subscriptionId);
      const revokedEnding = await seat(planId, subscriptionId, { expectedEndDate: '2026-12-15' });
      const done = await seat(planId, subscriptionId, { expectedEndDate: '2026-12-15' });
      await task(revoked, 'REVOKE', 'IN_PROGRESS');
      await task(revokedEnding, 'REVOKE', 'QUEUED');
      await task(done, 'REVOKE', 'QUEUED', true);

      const facts = await factsOf(subscriptionId, planId);

      expect(facts.heldPastRenewal).toBe(1);
      expect(facts.endingAssignmentIds).toEqual([done]);
      expect(facts.activeSeatsToday).toBe(4);
    });

    it('counts the grants of the plan approved and waiting only when asked, and only the ones no subscription holds', async () => {
      const { subscriptionId, planId } = await subscription();
      const waiting = await seat(planId, null);
      await task(waiting, 'GRANT', 'QUEUED');
      const retrying = await seat(planId, null);
      await task(retrying, 'GRANT', 'RETRY_SCHEDULED');
      const granted = await seat(planId, null);
      await task(granted, 'GRANT', 'COMPLETED');
      await seat(planId, null);
      const held = await seat(planId, subscriptionId);
      await task(held, 'GRANT', 'QUEUED');
      const { planId: otherPlan } = await subscription();
      await task(await seat(otherPlan, null), 'GRANT', 'QUEUED');

      expect((await factsOf(subscriptionId, planId, true)).approvedAwaitingGrant).toBe(2);
      expect((await factsOf(subscriptionId, planId, false)).approvedAwaitingGrant).toBe(0);
      // The grant waiting is not a seat of the subscription: it is neither held nor in effect on it.
      expect(await factsOf(subscriptionId, planId, true)).toMatchObject({ heldPastRenewal: 1, activeSeatsToday: 1 });
    });
  });

  describe('the open requests of a plan, read through the module of requests', () => {
    it('counts a request until it reaches a final state', async () => {
      const unit = await h.unit(1);
      await h.withApprover();
      const subscriptionId = await h.term({ ownerDepartmentId: unit.department.id });
      const planId = await h.planOf(subscriptionId);
      const requests = h.ctx.app.get(AccessRequestRepo, { strict: false });
      expect(await requests.countOpenOfPlan(planId)).toBe(0);

      const sent = await h.sent(unit.members[0], planId);
      expect(await requests.countOpenOfPlan(planId)).toBe(1);

      // The table keeps the withdrawal and cancellation columns and the state together, so the state moves with them.
      const moveTo = (state: string) =>
        h.ctx.sql.query(
          `UPDATE access_requests SET state = $2::"AccessRequestState",
             withdrawal_requested_at = CASE WHEN $2 IN ('WITHDRAWN', 'AWAITING_IT_CLOSE') THEN now() END,
             withdrawn_by_employee_id = CASE WHEN $2 IN ('WITHDRAWN', 'AWAITING_IT_CLOSE') THEN requester_employee_id END,
             withdrawn_at = CASE WHEN $2 = 'WITHDRAWN' THEN now() END,
             cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN now() END,
             cancel_cause = CASE WHEN $2 = 'CANCELLED' THEN 'SYSTEM_SCOPE_REMOVED'::"AccessRequestCancelCause" END
           WHERE id = $1`,
          [sent.id, state],
        );
      for (const state of ['REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED']) {
        await moveTo(state);
        expect({ state, open: await requests.countOpenOfPlan(planId) }).toEqual({ state, open: 0 });
      }
      await moveTo('AWAITING_IT_CLOSE');
      expect(await requests.countOpenOfPlan(planId)).toBe(1);
    });
  });

  describe('RenewalSeatsNeededService, with the real hook of the module of requests', () => {
    it('adds the seats held past the renewal day to the grants waiting and reads the open requests of the plan', async () => {
      const { subscriptionId, planId } = await subscription();
      await seat(planId, subscriptionId);
      await seat(planId, subscriptionId, { expectedEndDate: RENEWAL_ON });
      await task(await seat(planId, null), 'GRANT', 'QUEUED');
      const service = h.ctx.app.get(RenewalSeatsNeededService, { strict: false });
      const period = { subscriptionId, planId, vendorMinimumSeats: 5, renewalOn: RENEWAL_ON, today: TODAY };

      expect(await service.countFor({ ...period, isPrimaryForPlan: true })).toEqual({
        heldPastRenewal: 1,
        pendingContinuations: 0,
        approvedAwaitingGrant: 1,
        seatsNeeded: 2,
        vendorMinimumSeats: 5,
        target: 5,
        activeSeatsToday: 2,
        openRequests: 0,
      });
      expect((await service.countFor({ ...period, isPrimaryForPlan: false })).seatsNeeded).toBe(1);
    });
  });
});
