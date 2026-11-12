import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-5, F5-02 (step 13 of Wave 1): the IT Admin proposes to reduce a subscription and names the seats to take back; the head of
 * the department that owns the subscription — not the spending approver — confirms it; the IT Admin records the outcome with the
 * vendor. Finance only reads and is told the result. Real sign-in, the seeded dataset, nothing mocked.
 *
 * Whose subscription it is: only a subscription that a department owns has a head who decides it. The subscriptions of the shared pool
 * (`QĐ-103d`: every plan but the K1 ones in the dataset) have no owner department and are not proposed or decided here yet, so the
 * scenarios run on ChatGPT Plus (K1, owned by Engineering), whose one seat the dataset granted to NV-DEV1 (R18).
 */
describe('F5-02 IT đề xuất giảm, trưởng phòng sở hữu xác nhận, IT ghi kết quả @MF5 @D1', () => {
  let world: FlowWorld;
  let renewalId: string;
  let seatId: string;

  const call = () => world.calls;
  const detail = async (code: string) =>
    call().data<{ renewal: { state: string; waitingReason: string | null; decision: Record<string, unknown> | null } }>(
      await call().get(code, `/subscription-renewals/${renewalId}`),
    ).renewal;

  beforeAll(async () => {
    world = await FlowWorld.open();
    const dev1 = await world.facts.employeeId('NV-DEV1');
    const chatgpt = await call().planId('ChatGPT Plus');
    seatId = (
      await world.facts.one<{ id: string }>(
        `SELECT id FROM license_assignments WHERE employee_id = $1 AND plan_id = $2 AND kind = 'PERSONAL'`,
        [dev1, chatgpt],
      )
    ).id;
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it('IT Admin đề xuất giảm về 0 kèm danh sách ghế thu hồi; trưởng phòng sở hữu thấy, Người duyệt chi không #9 @B5', async () => {
    const subscriptionId = await call().subscriptionOf('ChatGPT Plus');
    const proposed = await call().post('NV-ITA1', '/subscription-renewals', {
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 0,
      releasedAssignmentIds: [seatId],
      note: 'Nhóm đã chuyển sang công cụ khác',
    });
    expect(proposed.status).toBe(201);
    renewalId = call().data<{ renewal: { id: string } }>(proposed).renewal.id;

    const asHead = await detail('NV-ENGH');
    expect(asHead).toMatchObject({ state: 'PROPOSED', waitingReason: null });
    expect((await call().get('NV-CEO', `/subscription-renewals/${renewalId}`)).status).toBe(403);
    expect(call().codeOf(await call().get('NV-CEO', '/subscription-renewals'))).toBe(
      'SUBSCRIPTION_RENEWAL.READ_FORBIDDEN',
    );
    expect((await call().get('NV-FIN1', `/subscription-renewals/${renewalId}`)).status).toBe(200);
    expect(
      (await world.facts.notices('SUBSCRIPTION_RENEWAL_PROPOSED', renewalId)).map((row) => row.recipient_employee_id),
    ).toEqual([await world.facts.employeeId('NV-ENGH')]);
  });

  it('chỉ trưởng phòng sở hữu quyết; Người duyệt chi, IT Admin, Finance bị 403, trưởng phòng khác 404; body cũ bị 422 và hồ sơ không đổi #9 @B5', async () => {
    const path = `/subscription-renewals/${renewalId}/decision`;

    for (const code of ['NV-CEO', 'NV-ITA1', 'NV-FIN1']) {
      const refused = await call().post(code, path, { decision: 'CONFIRM' });
      expect(refused.status).toBe(403);
    }
    // The head of another department finds no such case (A-M2).
    const otherHead = await call().post('NV-DESH', path, { decision: 'CONFIRM' });
    expect([otherHead.status, call().codeOf(otherHead)]).toEqual([404, 'SUBSCRIPTION_RENEWAL.NOT_FOUND']);
    expect(call().codeOf(await call().post('NV-CEO', path, { decision: 'CONFIRM' }))).toBe(
      'SUBSCRIPTION_RENEWAL.NOT_DECIDER',
    );
    for (const body of [
      { choice: 'REDUCE', quantity: 0 },
      { decision: 'CONFIRM', choice: 'RENEW' },
      { decision: 'CONFIRM', quantity: 0 },
      { decision: 'CONFIRM', withinCurrentTerm: true },
      { decision: 'CONFIRM', releasedAssignmentIds: [seatId] },
    ]) {
      const response = await call().post('NV-ENGH', path, body);
      expect(response.status).toBe(422);
      expect(call().codeOf(response)).toBe('VALIDATION_ERROR');
    }
    expect((await detail('NV-ENGH')).state).toBe('PROPOSED');
    expect(await world.facts.count('provisioning_tasks', "kind = 'REVOKE' AND assignment_id = $1", [seatId])).toBe(0);
  });

  it('trưởng phòng sở hữu xác nhận: quyết định là của họ, tác vụ thu hồi ghế đã chọn mở ra, IT Admin và Finance được báo #9 @B5', async () => {
    const confirmed = await call().post('NV-ENGH', `/subscription-renewals/${renewalId}/decision`, {
      decision: 'CONFIRM',
      reason: 'Đồng ý giảm theo đề xuất của IT',
    });

    expect(confirmed.status).toBe(200);
    const decision = call().data<{ renewal: { decision: Record<string, unknown> } }>(confirmed).renewal.decision;
    expect(decision).toMatchObject({ choice: 'REDUCE', deciderRole: 'OWNER_DEPARTMENT_HEAD', releasedSeatCount: 1 });
    expect(await world.facts.count('provisioning_tasks', "kind = 'REVOKE' AND assignment_id = $1", [seatId])).toBe(1);
    const told = (await world.facts.notices('SUBSCRIPTION_RENEWAL_DECIDED', renewalId)).map(
      (row) => row.recipient_employee_id,
    );
    expect(told.sort()).toEqual(
      [await world.facts.employeeId('NV-ITA1'), await world.facts.employeeId('NV-FIN1')].sort(),
    );
    // The IT Admin does not read the money the head saw; the head and Finance do.
    expect((await detail('NV-ITA1')).decision?.snapshot).toBeNull();
    expect((await detail('NV-ENGH')).decision?.snapshot).not.toBeNull();
    // A second confirmation changes nothing.
    expect(
      call().codeOf(
        await call().post('NV-ENGH', `/subscription-renewals/${renewalId}/decision`, { decision: 'CONFIRM' }),
      ),
    ).toBe('SUBSCRIPTION_RENEWAL.NOT_AWAITING_DECISION');
  });

  it('IT Admin ghi kết quả với nhà cung cấp; kết quả khác quyết định phải có lý do và bằng chứng #9 @B5', async () => {
    const path = `/subscription-renewals/${renewalId}/outcome`;

    expect((await call().post('NV-CEO', path, { outcome: 'UNCONFIRMED' })).status).toBe(403);
    expect((await call().post('NV-ENGH', path, { outcome: 'UNCONFIRMED' })).status).toBe(403);
    const withoutNote = await call().post('NV-ITA1', path, { outcome: 'VENDOR_REFUSED' });
    expect(withoutNote.status).toBe(422);
    expect(call().codeOf(withoutNote)).toBe('VALIDATION_ERROR');
    expect((await detail('NV-ITA1')).state).toBe('DECIDED');

    const recorded = await call().post('NV-ITA1', path, {
      outcome: 'VENDOR_REFUSED',
      note: 'Nhà cung cấp không giảm số lượng giữa kỳ, theo e-mail của đại diện',
    });
    expect(recorded.status).toBe(200);
    expect((await detail('NV-FIN1')).state).toBe('OUTCOME_RECORDED');
  });
});
