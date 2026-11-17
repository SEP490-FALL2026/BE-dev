import { addDays } from '../../src/core/business-date';
import { FlowWorld } from '../support/flows/flow-world';

interface Adjustment {
  subscriptionId: string;
  commitment: string;
  deadline: string;
  adjustmentPointOn: string;
  renewalOn: string;
  purchasedQuantity: number;
  seatsNeeded: { total: number; heldPastRenewal: number; pendingContinuations: number; approvedAwaitingGrant: number };
  target: number;
  suggestedChoice: string | null;
  canCancel: boolean;
  activeSeatsToday: number;
  openRequests: number;
  responsibleItAdminEmployeeId: string | null;
  callerIsResponsible: boolean;
  recordedRenewalId: string | null;
}

/**
 * MF-5, F5-02 (SBF-20): check the usage, take the idle seat back, then adjust the subscription at its point of adjustment. The head of the
 * department reclaims the seat of a holder who left it idle (the ghost seat flow); the IT Admin completes the revocation; the system counts the
 * seats the next period needs and the IT Admin records the result ONCE with the vendor — nobody proposes and nobody confirms (`QĐ-103e`), and
 * Finance only reads and is told. Real sign-in, the seeded dataset, nothing mocked.
 *
 * Whose subscription it is: the point of adjustment belongs to a workspace of the shared pool (`QĐ-103d`, K2). Figma Professional is the
 * annual one of the dataset (18 seats bought, 14 in effect, the point opened 10 days ago); its IT Admin in charge is NV-ITA2, so NV-ITA1 records
 * in their place (`QĐ-58b`: it blocks nothing).
 */
describe('F5-02 thu hồi ghế rảnh rồi IT ghi kết quả điều chỉnh một lần, không đề xuất hay xác nhận @MF5 @D1', () => {
  let world: FlowWorld;
  let subscriptionId: string;
  let renewalId: string;
  let nextSubscriptionId: string;
  let startTarget: number;
  let reclaimedSeat: string;

  const call = () => world.calls;
  const adjustment = async (code = 'NV-ITA1'): Promise<Adjustment> =>
    call().data<{ adjustment: Adjustment }>(
      await call().get(code, `/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`),
    ).adjustment;
  const revocationTasksOf = (employeeCode: string) =>
    world.facts.rows<{ id: string; status: string }>(
      `SELECT t.id, t.status::text FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
         JOIN employees e ON e.id = a.employee_id
        WHERE t.kind = 'REVOKE' AND a.subscription_id = $1 AND e.employee_code = $2`,
      [subscriptionId, employeeCode],
    );

  beforeAll(async () => {
    world = await FlowWorld.open();
    subscriptionId = await call().subscriptionOf('Figma Professional');
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it('hệ thống tính số seat cần; IT Admin và Finance đọc, trưởng phòng, Người duyệt chi, nhân viên bị 403 #9 @B5', async () => {
    const seen = await adjustment('NV-ITA2');

    expect(seen).toMatchObject({
      subscriptionId,
      commitment: 'ANNUAL',
      purchasedQuantity: 18,
      callerIsResponsible: true,
      recordedRenewalId: null,
      openRequests: 0,
    });
    // The point opened before today and the renewal comes after the deadline: the seats are counted at the renewal day.
    expect(seen.adjustmentPointOn <= call().today()).toBe(true);
    expect(seen.deadline >= call().today()).toBe(true);
    expect(seen.renewalOn > seen.deadline).toBe(true);
    expect(seen.seatsNeeded.total).toBe(
      seen.seatsNeeded.heldPastRenewal + seen.seatsNeeded.pendingContinuations + seen.seatsNeeded.approvedAwaitingGrant,
    );
    expect(seen.target).toBe(seen.seatsNeeded.total);
    expect(seen.target).toBeLessThan(seen.purchasedQuantity);
    expect(seen.suggestedChoice).toBe('REDUCE');
    // The seats in effect today are more than the seats needed after the renewal: some end before it, one is being taken back.
    expect(seen.activeSeatsToday).toBeGreaterThan(seen.target);
    expect(seen.canCancel).toBe(false);
    startTarget = seen.target;

    const other = await adjustment('NV-ITA1');
    expect(other).toMatchObject({ callerIsResponsible: false, target: seen.target });
    expect(other.responsibleItAdminEmployeeId).toBe(await world.facts.employeeId('NV-ITA2'));
    expect(
      (await call().get('NV-FIN1', `/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`)).status,
    ).toBe(200);
    for (const code of ['NV-DESH', 'NV-CEO', 'NV-DES1']) {
      const refused = await call().get(code, `/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`);
      expect([code, refused.status]).toEqual([code, 403]);
    }
  });

  it('trưởng phòng thu hồi ghế rảnh: số seat cần giảm ngay, ghế vẫn tính vào số đang dùng tới khi IT hoàn tất thu hồi #9 @B5', async () => {
    const before = await adjustment();
    // NV-DES1 holds a Figma seat idle for 79 days (G4 of the dataset): the head of Design decides to reclaim it.
    const recommendation = await world.facts.one<{ id: string }>(
      `SELECT r.id FROM ghost_seat_recommendations r JOIN employees e ON e.id = r.employee_id
        WHERE e.employee_code = 'NV-DES1' AND r."group" = 'G4' AND r.state = 'AWAITING_DECISION'`,
    );
    await world.clock.sweep('ghostSeatQueue');
    const queue = call().data<{ items: { id: string }[] }>(await call().get('NV-DESH', '/ghost-seat-queue'));
    expect(queue.items.map((item) => item.id)).toContain(recommendation.id);

    const decided = await call().post('NV-DESH', '/ghost-seat-decisions', {
      items: [{ recommendationId: recommendation.id }],
      choice: 'RECLAIM',
      reason: 'Không dùng Figma từ hơn hai tháng',
    });
    expect(decided.status).toBe(201);
    const [item] = call().data<{ items: { revocationTaskId: string; outcome: string }[] }>(decided).items;
    expect(item.outcome).toBe('RECLAIM_DECIDED');
    reclaimedSeat = item.revocationTaskId;

    // The seat being taken back is no longer needed: the number falls by one at once, the seat in effect today stays until it is revoked.
    const after = await adjustment();
    expect(after.target).toBe(before.target - 1);
    expect(after.seatsNeeded.heldPastRenewal).toBe(before.seatsNeeded.heldPastRenewal - 1);
    expect(after.activeSeatsToday).toBe(before.activeSeatsToday);
    expect(after.target).toBe(startTarget - 1);
  });

  it('IT Admin hoàn tất thu hồi sau ân hạn; ghế rảnh không còn trong số đang dùng #9 @B5', async () => {
    const before = await adjustment();
    const tasks = await world.facts.rows<{ id: string }>(
      `SELECT t.id FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
        WHERE t.kind = 'REVOKE' AND a.subscription_id = $1 AND t.status = 'QUEUED'`,
      [subscriptionId],
    );
    // The two seats taken back on this subscription: the one the dataset already decided (NV-DES11) and the one of this flow (NV-DES1).
    expect(tasks.map((task) => task.id)).toContain(reclaimedSeat);
    expect(tasks).toHaveLength(2);

    world.clock.jumpDays(7);
    // A week later the sessions of the morning have expired: the people sign in again (as the other flows do after a jump).
    for (const code of ['NV-ITA1', 'NV-ITA2', 'NV-FIN1', 'NV-DESH', 'NV-CEO', 'NV-DES1'])
      await world.actors.signIn(code);
    for (const task of tasks) {
      expect((await call().post('NV-ITA1', `/provisioning-tasks/${task.id}/claim`)).status).toBe(200);
      const done = await call().post('NV-ITA1', `/provisioning-tasks/${task.id}/revocation-completion`, {
        completion: 'ACCOUNT_REMOVED',
        evidence: 'đã gỡ tài khoản Figma',
      });
      expect(done.status).toBe(200);
    }

    const after = await adjustment();
    expect(after.activeSeatsToday).toBe(before.activeSeatsToday - 2);
    expect(after.target).toBe(before.target);
    expect(await revocationTasksOf('NV-DES1')).toEqual([{ id: reclaimedSeat, status: 'COMPLETED' }]);
  });

  it('IT Admin khác người phụ trách ghi kết quả một lần với số hệ thống tính: ca ghi đủ, không ai đề xuất, không ai xác nhận #9 @B5', async () => {
    const seen = await adjustment();
    const commitments = await world.facts.count('budget_commitments');

    const recorded = await call().post('NV-ITA1', '/subscription-renewals', {
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: seen.target,
      outcome: 'AS_DECIDED',
      nextPeriod: {
        purchasedQuantity: seen.target,
        unitPrice: { amount: '4500000', currency: 'VND' },
        billingCycle: 'ANNUAL',
        startDate: seen.renewalOn,
        endDate: addDays(seen.renewalOn, 364),
        renewalDate: addDays(seen.renewalOn, 365),
        noticePeriodDays: 30,
        autoRenew: true,
        allowsMidTermReduction: false,
      },
    });

    expect(recorded.status).toBe(201);
    const renewal = call().data<{
      renewal: {
        id: string;
        state: string;
        proposal: { choice: string; quantity: number; seatsNeeded: number };
        decision: { deciderRole: string; decidedByEmployeeId: string };
        outcomeDetail: { kind: string; nextSubscriptionId: string; lateRenewal: boolean };
      };
    }>(recorded).renewal;
    renewalId = renewal.id;
    nextSubscriptionId = renewal.outcomeDetail.nextSubscriptionId;
    expect(renewal).toMatchObject({
      state: 'OUTCOME_RECORDED',
      proposal: { choice: 'REDUCE', quantity: seen.target, seatsNeeded: seen.target },
      decision: { deciderRole: 'IT_ADMIN_IN_CHARGE', decidedByEmployeeId: await world.facts.employeeId('NV-ITA1') },
      outcomeDetail: { kind: 'AS_DECIDED', lateRenewal: false },
    });
    // The new period continues the old one with the seats held on its first day; nobody was asked and nothing was spent.
    expect(
      await world.facts.one<{ purchased_quantity: number; predecessor: string | null }>(
        `SELECT purchased_quantity, renewed_from_id AS predecessor FROM subscriptions WHERE id = $1`,
        [nextSubscriptionId],
      ),
    ).toEqual({ purchased_quantity: seen.target, predecessor: subscriptionId });
    expect(await world.facts.count('license_assignments', `subscription_id = $1`, [nextSubscriptionId])).toBe(
      seen.target,
    );
    for (const code of ['SUBSCRIPTION_RENEWAL_PROPOSED', 'SUBSCRIPTION_RENEWAL_DECIDED']) {
      expect(await world.facts.notices(code, renewalId)).toEqual([]);
    }
    expect(await world.facts.count('budget_commitments')).toBe(commitments);
  });

  it('Finance được báo kết quả, người phụ trách được báo vì có người ghi thay, Người duyệt chi và trưởng phòng không #9 @B5', async () => {
    const told = (await world.facts.notices('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', subscriptionId)).map(
      (row) => row.recipient_employee_id,
    );

    expect(told.sort()).toEqual(
      [await world.facts.employeeId('NV-FIN1'), await world.facts.employeeId('NV-ITA2')].sort(),
    );
    const audit = await world.facts.one<{ after: Record<string, unknown> }>(
      `SELECT after FROM audit_events WHERE resource_id = $1 AND action = 'SUBSCRIPTION_RENEWAL.PROPOSED'`,
      [renewalId],
    );
    expect(audit.after).toMatchObject({ substitute: true });
  });

  it('chỉ IT Admin ghi; Finance đọc ca, Người duyệt chi và trưởng phòng không thấy; route xác nhận cũ không còn #9 @B5', async () => {
    const body = { subscriptionId, choice: 'RENEW', outcome: 'UNCONFIRMED' };
    for (const code of ['NV-DESH', 'NV-CEO', 'NV-FIN1', 'NV-DES1']) {
      const refused = await call().post(code, '/subscription-renewals', body);
      expect([code, refused.status]).toEqual([code, 403]);
    }
    const asFinance = call().data<{ renewal: { state: string; subscription: { ownerDepartmentId: string | null } } }>(
      await call().get('NV-FIN1', `/subscription-renewals/${renewalId}`),
    ).renewal;
    expect(asFinance).toMatchObject({ state: 'OUTCOME_RECORDED', subscription: { ownerDepartmentId: null } });
    expect((await call().get('NV-ITA2', `/subscription-renewals/${renewalId}`)).status).toBe(200);
    // The head of a department reads the cases of the subscriptions the department owns, and none of the shared pool.
    expect((await call().get('NV-DESH', `/subscription-renewals/${renewalId}`)).status).toBe(404);
    expect(call().codeOf(await call().get('NV-CEO', '/subscription-renewals'))).toBe(
      'SUBSCRIPTION_RENEWAL.READ_FORBIDDEN',
    );
    // The confirmation of the head is gone: the route is not there.
    const gone = await call().post('NV-DESH', `/subscription-renewals/${renewalId}/decision`, { decision: 'CONFIRM' });
    expect(gone.status).toBe(404);
  });

  it('kỳ đã có kết quả: không ghi lại được, số cần của kỳ cũ không còn đọc, kỳ mới là thuê bao nối tiếp #9 @B5', async () => {
    const again = await call().post('NV-ITA1', '/subscription-renewals', {
      subscriptionId,
      choice: 'RENEW',
      outcome: 'UNCONFIRMED',
    });
    expect([again.status, call().codeOf(again), call().detailsOf(again)]).toEqual([
      409,
      'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE',
      { reason: 'ALREADY_CONTINUED' },
    ]);
    const read = await call().get('NV-ITA1', `/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`);
    expect([read.status, call().codeOf(read)]).toEqual([409, 'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE']);
    expect(nextSubscriptionId).not.toBe(subscriptionId);
  });
});
