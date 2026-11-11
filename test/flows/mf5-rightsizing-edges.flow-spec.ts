import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-5, the edges of F5-02 (review D-M4): what the IT Admin may propose and what the head may confirm. The reduction names exactly the
 * seats above the new number, the fields of one choice are refused on another, a cancellation of a subscription in use is confirmed
 * after the warning, the head of another department finds no case, and a proposal that went out of date is closed so the IT Admin can
 * propose again (A-H2); the department with no head has its own file (`mf5-rightsizing-no-head`). Real sign-in, the seats granted through the whole Request flow, nothing mocked.
 *
 * Whose subscription it is: only a subscription that a department owns has a head who decides it. The subscriptions of the shared pool
 * (`QĐ-103d`) have no owner department and are not proposed or decided here yet, so the scenarios run on the two the dataset gives
 * Engineering: Cursor Pro (K1, no seat yet) for the reduction and the cancellation, ChatGPT Plus (K1, the seat of NV-DEV1 from R18) for
 * the proposal that goes out of date. Each K1 grant buys one more seat, so the seats bought follow the seats held.
 */
describe('MF-5 giảm, hủy và đề xuất lỗi thời: các biên của F5-02 @MF5 @D1', () => {
  let world: FlowWorld;

  const call = () => world.calls;
  const stateOf = async (id: string) =>
    (await world.facts.one<{ state: string }>(`SELECT state::text FROM subscription_renewals WHERE id = $1`, [id]))
      .state;
  /** The revocation tasks this file made: the dataset already holds one (the Thu hồi of NV-DES11, R-MF5), which is not ours. */
  let revokeBaseline = 0;
  const revokeTasks = async () => (await world.facts.count('provisioning_tasks', "kind = 'REVOKE'")) - revokeBaseline;

  /** One seat through the whole flow: need, batch, spend decision, the grant task of the IT Admin. Returns the assignment id. */
  const grantSeat = async (employeeCode: string, planName: string, subscriptionName: string): Promise<string> => {
    const plan = await call().planId(planName);
    const requestId = await call().submitRequest(employeeCode, plan);
    expect((await call().approveNeed('NV-ENGH', requestId)).status).toBe(200);
    expect((await call().submitBatch('NV-ENGH', [requestId])).status).toBe(201);
    const approved = await call().post('NV-CEO', `/access-requests/${requestId}/spend-approval`, {
      decision: 'APPROVE',
    });
    expect(approved.status).toBe(200);
    const subscriptionId = await call().subscriptionOf(subscriptionName);
    const task = await call().post('NV-ITA1', '/provisioning-tasks', { requestId, subscriptionId });
    expect(task.status).toBe(201);
    const taskId = call().data<{ task: { id: string } }>(task).task.id;
    expect((await call().post('NV-ITA1', `/provisioning-tasks/${taskId}/claim`)).status).toBe(200);
    expect(
      (await call().post('NV-ITA1', `/provisioning-tasks/${taskId}/complete`, { evidence: 'Đã cấp' })).status,
    ).toBe(200);

    return (
      await world.facts.one<{ id: string }>(
        `SELECT id FROM license_assignments WHERE employee_id = $1 AND plan_id = $2 AND kind = 'PERSONAL' AND valid_until IS NULL`,
        [await world.facts.employeeId(employeeCode), plan],
      )
    ).id;
  };

  const propose = (subscriptionId: string, body: Record<string, unknown>) =>
    call().post('NV-ITA1', '/subscription-renewals', { subscriptionId, ...body });
  const confirm = (code: string, id: string, body: Record<string, unknown> = {}) =>
    call().post(code, `/subscription-renewals/${id}/decision`, { decision: 'CONFIRM', ...body });

  let cursor: string[];
  let chatgpt: string[];

  beforeAll(async () => {
    world = await FlowWorld.open();
    // Nobody holds Cursor Pro in the dataset: two people of Engineering get a seat. DEV1 holds a ChatGPT Plus seat (R18) and DEV2 gets one.
    const dev1ChatgptSeat = (
      await world.facts.one<{ id: string }>(
        `SELECT id FROM license_assignments WHERE employee_id = $1 AND plan_id = $2 AND kind = 'PERSONAL'`,
        [await world.facts.employeeId('NV-DEV1'), await call().planId('ChatGPT Plus')],
      )
    ).id;
    cursor = [
      await grantSeat('NV-DEV1', 'Cursor Pro', 'Cursor Pro'),
      await grantSeat('NV-DEV2', 'Cursor Pro', 'Cursor Pro'),
    ];
    chatgpt = [dev1ChatgptSeat, await grantSeat('NV-DEV2', 'ChatGPT Plus', 'ChatGPT Plus')];
    revokeBaseline = await world.facts.count('provisioning_tasks', "kind = 'REVOKE'");
  }, 400000);

  afterAll(async () => {
    await world?.close();
  });

  describe('đề xuất: danh sách ghế thu hồi và trường theo lựa chọn @B5', () => {
    it('giảm phải nêu đúng số ghế vượt; thiếu, thừa hoặc ghế không phải của thuê bao ⟹ 422 và không ghi gì #9', async () => {
      const subscriptionId = await call().subscriptionOf('Cursor Pro');
      const cases = await world.facts.count('subscription_renewals');
      const unknown = '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10';

      const none = await propose(subscriptionId, { choice: 'REDUCE', proposedQuantity: 0, releasedAssignmentIds: [] });
      const short = await propose(subscriptionId, {
        choice: 'REDUCE',
        proposedQuantity: 0,
        releasedAssignmentIds: [cursor[0]],
      });
      const foreign = await propose(subscriptionId, {
        choice: 'REDUCE',
        proposedQuantity: 0,
        releasedAssignmentIds: [cursor[0], unknown],
      });
      const extra = await propose(subscriptionId, {
        choice: 'REDUCE',
        proposedQuantity: 1,
        releasedAssignmentIds: [cursor[0], cursor[1]],
      });

      for (const response of [none, short, foreign, extra]) {
        expect(response.status).toBe(422);
        expect(call().codeOf(response)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_SELECTION_INVALID');
      }
      expect(call().detailsOf(short)).toEqual({ required: 2, selected: 1 });
      expect(await world.facts.count('subscription_renewals')).toBe(cases);
    });

    it('trường của lựa chọn khác bị từ chối: số lượng với giữ nguyên hoặc hủy, danh sách ghế với giữ nguyên hoặc hủy #9', async () => {
      const subscriptionId = await call().subscriptionOf('Cursor Pro');
      const cases = await world.facts.count('subscription_renewals');

      const renewWithQuantity = await propose(subscriptionId, { choice: 'RENEW', proposedQuantity: 1 });
      const cancelWithQuantity = await propose(subscriptionId, { choice: 'CANCEL', proposedQuantity: 0 });
      const renewWithSeats = await propose(subscriptionId, { choice: 'RENEW', releasedAssignmentIds: [cursor[0]] });
      const cancelWithSeats = await propose(subscriptionId, { choice: 'CANCEL', releasedAssignmentIds: [cursor[0]] });
      const reduceAboveBought = await propose(subscriptionId, { choice: 'REDUCE', proposedQuantity: 999 });

      expect(call().codeOf(renewWithQuantity)).toBe('SUBSCRIPTION_RENEWAL.QUANTITY_INVALID');
      expect(call().codeOf(cancelWithQuantity)).toBe('SUBSCRIPTION_RENEWAL.QUANTITY_INVALID');
      expect(call().codeOf(renewWithSeats)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_SELECTION_INVALID');
      expect(call().codeOf(cancelWithSeats)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_SELECTION_INVALID');
      expect(call().codeOf(reduceAboveBought)).toBe('SUBSCRIPTION_RENEWAL.QUANTITY_INVALID');
      for (const response of [
        renewWithQuantity,
        cancelWithQuantity,
        renewWithSeats,
        cancelWithSeats,
        reduceAboveBought,
      ]) {
        expect([422]).toContain(response.status);
      }
      expect(await world.facts.count('subscription_renewals')).toBe(cases);
    });
  });

  describe('xác nhận: phạm vi và cảnh báo @B5', () => {
    let cancelId: string;

    it('trưởng phòng khác không thấy hồ sơ (404), IT Admin và Finance bị 403, trưởng phòng sở hữu đọc được #9', async () => {
      const subscriptionId = await call().subscriptionOf('Cursor Pro');
      const proposed = await propose(subscriptionId, {
        choice: 'CANCEL',
        businessOwnerOpinion: 'Chuyển sang công cụ khác',
      });
      expect(proposed.status).toBe(201);
      cancelId = call().data<{ renewal: { id: string } }>(proposed).renewal.id;

      const otherHeadRead = await call().get('NV-SALH', `/subscription-renewals/${cancelId}`);
      const otherHeadDecide = await confirm('NV-SALH', cancelId);
      const itDecide = await confirm('NV-ITA1', cancelId);
      const financeDecide = await confirm('NV-FIN1', cancelId);

      expect([otherHeadRead.status, call().codeOf(otherHeadRead)]).toEqual([404, 'SUBSCRIPTION_RENEWAL.NOT_FOUND']);
      expect([otherHeadDecide.status, call().codeOf(otherHeadDecide)]).toEqual([404, 'SUBSCRIPTION_RENEWAL.NOT_FOUND']);
      expect([itDecide.status, call().codeOf(itDecide)]).toEqual([403, 'SUBSCRIPTION_RENEWAL.NOT_DECIDER']);
      expect([financeDecide.status, call().codeOf(financeDecide)]).toEqual([403, 'SUBSCRIPTION_RENEWAL.NOT_DECIDER']);
      expect((await call().get('NV-ENGH', `/subscription-renewals/${cancelId}`)).status).toBe(200);
      expect(await stateOf(cancelId)).toBe('PROPOSED');
    });

    it('hủy thuê bao còn người dùng: phải xác nhận sau cảnh báo; xác nhận mở thu hồi mọi ghế cá nhân #9', async () => {
      const warned = await confirm('NV-ENGH', cancelId);

      expect([warned.status, call().codeOf(warned)]).toEqual([
        409,
        'SUBSCRIPTION_RENEWAL.ACTIVE_USERS_NOT_ACKNOWLEDGED',
      ]);
      expect(call().detailsOf(warned)).toEqual({ seatsInUse: cursor.length });
      expect(await stateOf(cancelId)).toBe('PROPOSED');
      expect(await revokeTasks()).toBe(0);

      const confirmed = await confirm('NV-ENGH', cancelId, {
        acknowledgeActiveUsers: true,
        reason: 'Nhóm đã đổi công cụ',
      });

      expect(confirmed.status).toBe(200);
      expect(await stateOf(cancelId)).toBe('DECIDED');
      expect(await revokeTasks()).toBe(cursor.length);
    });
  });

  describe('đề xuất lỗi thời: đóng lại để đề xuất lại (A-H2) @B5', () => {
    it('một ghế nữa được cấp sau đề xuất: xác nhận ⟹ 409 PROPOSAL_STALE, hồ sơ đóng STALE, IT đề xuất lại và xác nhận được', async () => {
      const subscriptionId = await call().subscriptionOf('ChatGPT Plus');
      const first = await propose(subscriptionId, {
        choice: 'REDUCE',
        proposedQuantity: 1,
        releasedAssignmentIds: [chatgpt[1]],
      });
      expect(first.status).toBe(201);
      const staleId = call().data<{ renewal: { id: string } }>(first).renewal.id;
      // A third person gets a seat before the head confirms: the excess is now two seats, the proposal names one.
      const third = await grantSeat('NV-DEV3', 'ChatGPT Plus', 'ChatGPT Plus');

      const stale = await confirm('NV-ENGH', staleId);

      expect([stale.status, call().codeOf(stale)]).toEqual([409, 'SUBSCRIPTION_RENEWAL.PROPOSAL_STALE']);
      expect(call().detailsOf(stale)).toEqual({ required: 2, stillHeld: 1 });
      expect(await stateOf(staleId)).toBe('STALE');
      expect(await revokeTasks()).toBe(cursor.length);
      const again = await confirm('NV-ENGH', staleId);
      expect(call().codeOf(again)).toBe('SUBSCRIPTION_RENEWAL.NOT_AWAITING_DECISION');

      const second = await propose(subscriptionId, {
        choice: 'REDUCE',
        proposedQuantity: 1,
        releasedAssignmentIds: [chatgpt[1], third],
      });
      expect(second.status).toBe(201);
      const secondId = call().data<{ renewal: { id: string } }>(second).renewal.id;
      expect(secondId).not.toBe(staleId);
      expect(call().codeOf(await propose(subscriptionId, { choice: 'RENEW' }))).toBe(
        'SUBSCRIPTION_RENEWAL.ALREADY_PROPOSED',
      );
      expect((await confirm('NV-ENGH', secondId)).status).toBe(200);
      expect(await revokeTasks()).toBe(cursor.length + 2);
    });
  });
});
