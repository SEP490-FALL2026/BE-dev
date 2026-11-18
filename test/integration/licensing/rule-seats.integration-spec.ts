import { LicensingGhostSeatApi } from '../../../src/modules/licensing/public/licensing-ghost-seat.api';
import { GhostSeatWorld } from '../../support/ghost-seat-world';
import { k1Checklist } from '../../support/k1-checklist';

const w = new GhostSeatWorld();

describe('what the rules of wasted seats read of licensing (integration, real PostgreSQL)', () => {
  const api = () => w.ctx.app.get(LicensingGhostSeatApi);

  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  it('INV-01: counts every assignment not ended and not failed as taken, the next period of a subscription replaces the one it renews, an ended one is out', async () => {
    const current = await w.worldSubscription(10, 'K2');
    await w.fillSeats(current, 6);
    const ended = await w.worldSubscription(10, 'K2');
    await w.ctx.sql.query(`UPDATE subscriptions SET end_date = '2026-01-06' WHERE id = $1`, [ended]);
    const today = w.today();

    const vacancies = await api().listSharedPoolVacancies(today);

    expect(vacancies.find((vacancy) => vacancy.subscriptionId === current)).toMatchObject({
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      purchased: 10,
      occupied: 6,
      free: 4,
    });
    expect(vacancies.find((vacancy) => vacancy.subscriptionId === ended)).toBeUndefined();
  });

  it('lists a person seat with the root of its chain, its plan facts, the revocation under way and the K1 access that runs on', async () => {
    const k2 = await w.worldSubscription(5, 'K2');
    const { employeeId, assignmentId } = await w.leaverSeat(k2, 'E-RS-1');
    const { taskId } = await w.open(assignmentId, 'DEPARTURE');
    const k1 = await w.worldSubscription(5, 'K1');
    const terminating = await w.leaverSeat(k1, 'E-RS-2');
    const k1Task = await w.open(terminating.assignmentId, 'ABRUPT_DEPARTURE');
    await w.claim(k1Task.taskId).expect(200);
    const until = w.inDays(30);
    await w
      .revoked(k1Task.taskId, {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'x',
        paidThroughOn: until,
        accessState: 'UNTIL_PAID_END',
        k1Checklist: k1Checklist('DEPARTURE'),
      })
      .expect(200);

    const seats = await api().listSeatsForRules({ asOf: w.today(), employeeIds: [employeeId, terminating.employeeId] });

    const first = seats.find((seat) => seat.assignmentId === assignmentId);
    expect(first).toMatchObject({
      chainRootId: assignmentId,
      kind: 'PERSONAL',
      subscriptionId: k2,
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      employeeId,
      liveRevocation: { taskId, status: 'QUEUED', sources: ['DEPARTURE'] },
      terminatingUntil: null,
    });
    const second = seats.find((seat) => seat.assignmentId === terminating.assignmentId);
    expect(second).toMatchObject({ liveRevocation: null, terminatingUntil: until });
  });

  it('follows a chain of assignments (a seat carried to the next period) to its first assignment, and answers for the status of tasks in one read', async () => {
    const k2 = await w.worldSubscription(5, 'K2');
    const { assignmentId } = await w.leaverSeat(k2, 'E-RS-3');
    await w.ctx.sql.query(`UPDATE license_assignments SET valid_until = valid_from + 1 WHERE id = $1`, [assignmentId]);
    const { rows } = await w.ctx.sql.query<{ id: string }>(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, predecessor_id, created_by_app_user_id)
       SELECT gen_random_uuid(), organization_id, kind, 'RENEWAL_CARRY', plan_id, subscription_id, employee_id, account_identifier,
              normalized_account_identifier, valid_from + 1, 'RECORDED', id, created_by_app_user_id
         FROM license_assignments WHERE id = $1 RETURNING id`,
      [assignmentId],
    );
    const carried = rows[0].id;

    const seats = await api().listSeatsForRules({ asOf: w.today() });

    expect(seats.find((seat) => seat.assignmentId === carried)?.chainRootId).toBe(assignmentId);
    expect(seats.find((seat) => seat.assignmentId === assignmentId)).toBeUndefined();
    const { taskId } = await w.open(carried, 'DEPARTURE');
    const standings = await api().getRevocationTaskStatuses([taskId, assignmentId]);
    expect([...standings.keys()]).toEqual([taskId]);
    expect(standings.get(taskId)).toMatchObject({ status: 'QUEUED', referencedSources: ['DEPARTURE'] });
  });
});
