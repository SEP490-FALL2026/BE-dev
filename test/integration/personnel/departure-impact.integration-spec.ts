import { addDays } from '../../../src/core/business-date';
import { nthWorkingDayFrom } from '../../../src/core/working-days';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { SystemActor } from '../../../src/modules/licensing/public/licensing.types';
import { DepartureImpactService } from '../../../src/modules/personnel/departure-deadline/departure-impact.service';
import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;
const SYSTEM: SystemActor = { kind: 'SYSTEM', correlationId: 'departure-impact:test' };
/** The tables a departure, or a preview of one, could touch: a preview must leave every one of them as it found it. */
const TABLES = [
  'access_requests',
  'access_request_steps',
  'access_request_lines',
  'budget_commitments',
  'budget_commitment_releases',
  'provisioning_tasks',
  'license_assignments',
  'offboarding_cases',
  'offboarding_case_changes',
  'audit_events',
  'in_app_notifications',
  'email_outbox',
] as const;

/**
 * `MF2-B.3` (P23, MIN-7): what a departure would do to a person, read in one transaction by the service that the record of the departure
 * and the preview share, on real PostgreSQL. The preview writes nothing, and says what the system does when it closes the requests of a
 * person who is gone (`BeneficiaryGoneCancellation`), which the last case runs to compare.
 */
describe('the impact of a departure, read and never written (integration, real PostgreSQL)', () => {
  const plans: { plan: string; subscriptionId: string }[] = [];
  let seatSubscription: string;
  let n = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    for (let i = 0; i < 3; i += 1) {
      const subscriptionId = await h.subscription(40);
      const planId = await h.planOf(subscriptionId);
      await h
        .declareTaxProfile((await h.vendorOf(planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
        .expect(200);
      plans.push({ plan: planId, subscriptionId });
    }
    seatSubscription = await h.subscription(40);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const example = async (): Promise<Unit & { leaver: Person }> => {
    n += 1;
    const u = await h.departmentWithHead(`P-DI${n}`);
    await h.budgetFor(u, { total: 200 * M, held: 20 * M, spent: 40 * M });
    const leaver = await h.worker(u.department, `DI-E${n}`);

    return { ...u, leaver };
  };
  const approvedFor = async (u: Unit, person: Person, which: number): Promise<string> => {
    const sent = await h.sent(person, plans[which].plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.setPayments(sent.id, { amount: 5 * M });
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  const granted = async (requestId: string, which: number): Promise<string> =>
    h.dataOf<{ task: { id: string } }>(
      await h.grant({ requestId, subscriptionId: plans[which].subscriptionId }).expect(201),
    ).task.id;
  const impact = (person: Person, lastWorkingDay: string, headSuccessorRequired = false) =>
    h.ctx.app
      .get(TransactionRunner, { strict: false })
      .run((tx) =>
        h.ctx.app
          .get(DepartureImpactService, { strict: false })
          .impactOf(tx, { employeeId: person.employeeId, today: h.today(), lastWorkingDay, headSuccessorRequired }),
      );
  const snapshot = async (): Promise<Record<string, string>> => {
    const found: Record<string, string> = {};
    for (const table of TABLES) {
      const { rows } = await h.ctx.sql.query<{ digest: string }>(
        `SELECT coalesce(md5(string_agg(t::text, ',' ORDER BY t::text)), '') AS digest FROM ${table} t`,
      );
      found[table] = rows[0].digest;
    }

    return found;
  };

  /** A person with a seat, a request that waits, a request approved with 5 million held, and a request whose grant is being carried out. */
  const busyLeaver = async () => {
    const u = await example();
    const code = `DI-E${n}`;
    const seat = await h.seatOf(u.leaver, { subscriptionId: seatSubscription }, code);
    const waiting = (await h.sent(u.leaver, plans[0].plan, { termMonths: 1 })).id;
    const approved = await approvedFor(u, u.leaver, 1);
    const running = await approvedFor(u, u.leaver, 2);
    await h.claim(await granted(running, 2)).expect(200);

    return { u, seat, waiting, approved, running };
  };

  it('lists the rights to take away, the requests the system closes, those it leaves to the IT Admin, what it gives back to the budget, and the deadline', async () => {
    const { u, seat, waiting, approved, running } = await busyLeaver();
    const lastWorkingDay = h.day(10);

    const found = await impact(u.leaver, lastWorkingDay);

    // The seat the person holds, and the seat of the grant being carried out for them: both go.
    expect(found.rightsToRevoke).toHaveLength(2);
    expect(found.rightsToRevoke.map((right) => right.assignmentId)).toContain(seat);
    expect(found.rightsToRevoke.every((right) => right.revocable && !right.revocationUnderWay)).toBe(true);
    expect(found.openRequestsToCancel.map((item) => item.requestId).sort()).toEqual([waiting, approved].sort());
    expect(found.provisioningInFlight.map((item) => item.requestId)).toEqual([running]);
    // What is held and not spent goes back, by currency: the approved request only (the one being carried out is the IT Admin's to check).
    expect(found.commitmentToRelease).toHaveLength(1);
    expect(BigInt(found.commitmentToRelease[0].amountMinor)).toBeGreaterThan(0n);
    expect(found.responsibilities).toEqual({ subscriptions: null, applications: null });
    expect(found.vendorAdminRoles).toEqual([]);
    expect(found.headSuccessorRequired).toBe(false);
    // The working day after the last one is the first of the days the IT Admin has (QĐ-110c): no day off in a test installation.
    expect(found.revocationDueOn).toBe(nthWorkingDayFrom(addDays(lastWorkingDay, 1), 1, new Set()));
  });

  it('says a head who leaves needs a successor, as the caller judged it', async () => {
    const { u } = await busyLeaver();

    expect((await impact(u.leaver, h.day(10), true)).headSuccessorRequired).toBe(true);
  });

  it('writes nothing: every table it could touch is as it was after the call', async () => {
    const { u } = await busyLeaver();
    const before = await snapshot();

    await impact(u.leaver, h.day(10));
    await impact(u.leaver, h.today());

    expect(await snapshot()).toEqual(before);
  });

  it('tells what the system does when the access is blocked: the same requests are closed, the others are left to the IT Admin', async () => {
    const { u, waiting, approved, running } = await busyLeaver();
    const found = await impact(u.leaver, h.today());

    const done = await h.ctx.app
      .get(TransactionRunner, { strict: false })
      .run((tx) =>
        h.ctx.app
          .get(RequestsApi, { strict: false })
          .cancelForBeneficiaryGone(tx, SYSTEM, { employeeId: u.leaver.employeeId, scope: { kind: 'ALL_OPEN' } }),
      );

    expect(done.cancelled.map((item) => item.requestId).sort()).toEqual(
      found.openRequestsToCancel.map((item) => item.requestId).sort(),
    );
    expect(done.needsItCheck.map((item) => item.requestId)).toEqual(
      found.provisioningInFlight.map((item) => item.requestId),
    );
    expect(
      [...done.cancelled.map((item) => item.requestId), ...done.needsItCheck.map((item) => item.requestId)].sort(),
    ).toEqual([waiting, approved, running].sort());
    const { rows } = await h.ctx.sql.query<{ released: string }>(
      `SELECT coalesce(sum(r.amount_minor), 0)::text AS released
         FROM budget_commitment_releases r JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = ANY($1::uuid[])`,
      [[waiting, approved, running]],
    );
    expect(rows[0].released).toBe(found.commitmentToRelease[0].amountMinor);
  });

  it('keeps the numbers it read with the record of the departure, read before the record changes anything', async () => {
    const { u } = await busyLeaver();
    const before = await impact(u.leaver, h.day(10));

    const wire = await h.recordedCase(u.leaver);

    const { rows } = await h.ctx.sql.query<{ detail: { impact: Record<string, unknown> } }>(
      `SELECT detail FROM offboarding_case_changes WHERE case_id = $1 AND kind = 'RECORDED'`,
      [wire.id],
    );
    expect(rows[0].detail.impact).toEqual({
      rights: before.rightsToRevoke.length,
      requestsToCancel: before.openRequestsToCancel.length,
      provisioningInFlight: before.provisioningInFlight.length,
      commitmentToRelease: before.commitmentToRelease,
      revocationDueOn: before.revocationDueOn,
    });
    expect(rows[0].detail.impact.rights).toBe(2);
  });

  it('counts nothing for a person with nothing open: no rights, no requests, no commitment', async () => {
    const u = await example();

    const found = await impact(u.leaver, h.day(10));

    expect(found).toMatchObject({
      rightsToRevoke: [],
      openRequestsToCancel: [],
      provisioningInFlight: [],
      commitmentToRelease: [],
    });
  });
});
