import { addDays } from '../../../src/core/business-date';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { SystemActor } from '../../../src/modules/licensing/public/licensing.types';
import { TransferImpactService } from '../../../src/modules/personnel/transfer-grace/transfer-impact.service';
import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;
const SYSTEM: SystemActor = { kind: 'SYSTEM', correlationId: 'transfer-impact:test' };
/** The tables a transfer, or a preview of one, could touch: a preview must leave every one of them as it found it. */
const TABLES = [
  'access_requests',
  'access_request_steps',
  'access_request_lines',
  'budget_commitments',
  'budget_commitment_releases',
  'provisioning_tasks',
  'license_assignments',
  'department_transfers',
  'department_transfer_changes',
  'audit_events',
  'in_app_notifications',
  'email_outbox',
] as const;

/**
 * `MF3-A.2` (P23, MIN-7): what a transfer would do to a person, read in one transaction by the service that the record of the transfer and
 * the preview share, on real PostgreSQL. The preview writes nothing, and says what the system does on the day the transfer takes effect to
 * the paid requests sent from the old department (`BeneficiaryGoneCancellation`, scope `PAID_OLD_DEPARTMENT`), which the last case runs to
 * compare. The days are those of the grace of five working days with the day the transfer takes effect as day 1 (SPEC T-MF3).
 */
describe('the impact of a transfer, read and never written (integration, real PostgreSQL)', () => {
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

  const example = async (): Promise<Unit & { mover: Person }> => {
    n += 1;
    const u = await h.departmentWithHead(`P-TI${n}`);
    await h.budgetFor(u, { total: 200 * M, held: 20 * M, spent: 40 * M });
    const mover = await h.worker(u.department, `TI-E${n}`);

    return { ...u, mover };
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
  /** The first Monday that is at least `from` days ahead: day 1 of a grace that ends on the Friday of the same week. */
  const mondayFrom = (from: number): string => {
    let day = h.day(from);
    while (new Date(`${day}T00:00:00.000Z`).getUTCDay() !== 1) day = addDays(day, 1);

    return day;
  };
  const impact = (u: Unit, person: Person, effectiveOn: string, headSuccessorRequired = false) =>
    h.ctx.app.get(TransactionRunner, { strict: false }).run((tx) =>
      h.ctx.app.get(TransferImpactService, { strict: false }).impactOf(tx, {
        employeeId: person.employeeId,
        fromDepartmentId: u.department.id,
        today: h.today(),
        effectiveOn,
        headSuccessorRequired,
      }),
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
  const busyMover = async () => {
    const u = await example();
    const code = `TI-E${n}`;
    const seat = await h.seatOf(u.mover, { subscriptionId: seatSubscription }, code);
    const waiting = (await h.sent(u.mover, plans[0].plan, { termMonths: 1 })).id;
    const approved = await approvedFor(u, u.mover, 1);
    const running = await approvedFor(u, u.mover, 2);
    await h.claim(await granted(running, 2)).expect(200);

    return { u, seat, waiting, approved, running };
  };

  it('lists the rights taken back when the grace ends, the paid requests of the old department the system closes, those it leaves to the IT Admin, what it gives back to the budget, and the days of the grace', async () => {
    const { u, seat, waiting, approved, running } = await busyMover();
    const effectiveOn = mondayFrom(10);

    const found = await impact(u, u.mover, effectiveOn);

    // The seat the person holds, and the seat of the grant being carried out for them: both are theirs to lose when the grace ends.
    expect(found.rightsToRevoke).toHaveLength(2);
    expect(found.rightsToRevoke.map((right) => right.assignmentId)).toContain(seat);
    expect(found.rightsToRevoke.every((right) => right.revocable && !right.revocationUnderWay)).toBe(true);
    expect(found.openRequestsToCancel.map((item) => item.requestId).sort()).toEqual([waiting, approved].sort());
    expect(found.provisioningInFlight.map((item) => item.requestId)).toEqual([running]);
    expect(found.commitmentToRelease).toHaveLength(1);
    expect(BigInt(found.commitmentToRelease[0].amountMinor)).toBeGreaterThan(0n);
    expect(found.responsibilities).toEqual({ subscriptions: null, applications: null });
    expect(found.vendorAdminRoles).toEqual([]);
    expect(found.headSuccessorRequired).toBe(false);
    // Day 1 is the Monday the transfer takes effect: day 5 is that Friday, and the person is told again on Wednesday (SPEC T-MF3, no day off here).
    expect(found.graceEndsOn).toBe(addDays(effectiveOn, 4));
    expect(found.graceReminderOn).toBe(addDays(effectiveOn, 2));
  });

  it('counts the grace from the next working day when the transfer takes effect on a day off', async () => {
    const { u } = await busyMover();
    const monday = mondayFrom(10);
    const saturday = addDays(monday, -2);

    const found = await impact(u, u.mover, saturday);

    expect(found.graceEndsOn).toBe(addDays(monday, 4));
    expect(found.graceReminderOn).toBe(addDays(monday, 2));
  });

  it('says a head who is moved needs a successor, as the caller judged it', async () => {
    const { u } = await busyMover();

    expect((await impact(u, u.mover, mondayFrom(10), true)).headSuccessorRequired).toBe(true);
  });

  it('writes nothing: every table it could touch is as it was after the call', async () => {
    const { u } = await busyMover();
    const before = await snapshot();

    await impact(u, u.mover, mondayFrom(10));
    await impact(u, u.mover, h.today());

    expect(await snapshot()).toEqual(before);
  });

  it('tells what the system does the day the transfer takes effect: the same paid requests of the old department are closed, the others are left to the IT Admin', async () => {
    const { u, waiting, approved, running } = await busyMover();
    const found = await impact(u, u.mover, h.today());

    const done = await h.ctx.app.get(TransactionRunner, { strict: false }).run((tx) =>
      h.ctx.app.get(RequestsApi, { strict: false }).cancelForBeneficiaryGone(tx, SYSTEM, {
        employeeId: u.mover.employeeId,
        scope: { kind: 'PAID_OLD_DEPARTMENT', oldDepartmentId: u.department.id },
      }),
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

  it('leaves out the requests sent from another department than the one the person leaves', async () => {
    const { u, waiting, approved } = await busyMover();
    const elsewhere = await example();

    const found = await impact(elsewhere, u.mover, mondayFrom(10));

    expect(found.rightsToRevoke).toHaveLength(2);
    expect(found.openRequestsToCancel.map((item) => item.requestId)).not.toContain(waiting);
    expect(found.openRequestsToCancel.map((item) => item.requestId)).not.toContain(approved);
    expect(found.openRequestsToCancel).toEqual([]);
  });

  it('counts nothing for a person with nothing open: no rights, no requests, no commitment', async () => {
    const u = await example();

    const found = await impact(u, u.mover, mondayFrom(10));

    expect(found).toMatchObject({
      rightsToRevoke: [],
      openRequestsToCancel: [],
      provisioningInFlight: [],
      commitmentToRelease: [],
    });
  });
});
