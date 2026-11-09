import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-3, the decisions of the head after a transfer (test-plan F3-05, the part Wave 1 settled): the person comes to Sales, the head of
 * Sales decides for each tool they hold — still needed or no longer needed, and always why — and nobody else does. The decision that
 * was retired (a new tool, its note, a term) is refused as a malformed body. Real sign-in, the seeded dataset, the clock moved to the day
 * the transfer takes effect, nothing mocked.
 */
describe('MF-3 điều chuyển: quyết định công cụ của trưởng phòng mới @MF3 @D1', () => {
  let world: FlowWorld;
  let reviewId: string;
  let assignmentId: string;

  const call = () => world.calls;
  const grounds = () => ({
    type: 'HR_DECISION',
    reference: 'QĐ-ĐC-2026-05',
    issuer: 'Phòng Nhân sự',
    issuedOn: call().today(),
  });
  const decide = (code: string, body: Record<string, unknown>) =>
    call().post(code, `/transfer-reviews/${reviewId}/decisions`, { assignmentId, ...body });
  const decided = () => world.facts.count('transfer_review_items', "decision <> 'PENDING'");

  beforeAll(async () => {
    world = await FlowWorld.open();
    await world.actors.ensure('NV-SA');
    const dev1 = await world.facts.employeeId('NV-DEV1');
    const sales = (await world.facts.one<{ id: string }>(`SELECT id FROM departments WHERE code = 'SAL'`)).id;

    // Base data is written on D0 (the clock rule); the person is placed on D0, so the transfer takes effect the next day.
    const self = await call().post('NV-SA', '/department-transfers', {
      employeeId: await world.facts.employeeId('NV-SA'),
      toDepartmentId: sales,
      effectiveOn: call().inDays(1),
      grounds: grounds(),
    });
    expect([self.status, call().codeOf(self)]).toEqual([403, 'PERSONNEL.SELF_CHANGE_FORBIDDEN']);
    expect(await world.facts.count('department_transfers')).toBe(0);
    const recorded = await call().post('NV-SA', '/department-transfers', {
      employeeId: dev1,
      toDepartmentId: sales,
      effectiveOn: call().inDays(1),
      grounds: grounds(),
    });
    expect(recorded.status).toBe(201);

    world.clock.jumpDays(1);
    await world.clock.sweep('organizationChange');
    for (const code of ['NV-SALH', 'NV-ENGH', 'NV-ITA1']) await world.actors.signIn(code);
    reviewId = (await world.facts.one<{ id: string }>(`SELECT id FROM transfer_reviews`)).id;
    assignmentId = (await world.facts.one<{ assignment_id: string }>(`SELECT assignment_id FROM transfer_review_items`))
      .assignment_id;
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it('khi điều chuyển có hiệu lực, trưởng phòng mới thấy các công cụ cần quyết; trưởng phòng cũ không thấy hồ sơ #17 #18 @B3', async () => {
    const asNewHead = await call().get('NV-SALH', `/transfer-reviews/${reviewId}/items`);
    const asOldHead = await call().get('NV-ENGH', `/transfer-reviews/${reviewId}/items`);

    expect(asNewHead.status).toBe(200);
    expect(call().data<{ items: Record<string, unknown>[] }>(asNewHead).items).toEqual([
      expect.objectContaining({ assignmentId, decision: 'PENDING', reason: null }),
    ]);
    expect([asOldHead.status, call().codeOf(asOldHead)]).toEqual([404, 'TRANSFER_REVIEW.NOT_FOUND']);
  });

  it('quyết định đã bỏ hoặc thiếu lý do ⟹ 422 VALIDATION_ERROR và không dòng nào được quyết #17 #18 @B3', async () => {
    const bodies: Record<string, unknown>[] = [
      { decision: 'NEEDS_NEW_TOOL', reason: 'Cần công cụ khác' },
      { decision: 'NEEDS_NEW_TOOL', reason: 'Cần công cụ khác', newToolNote: 'Slack' },
      { decision: 'NOT_NEEDED', reason: 'Không dùng nữa', newToolNote: 'Slack' },
      { decision: 'STILL_NEEDED', reason: 'Vẫn dùng', termMonths: 1 },
      { decision: 'NOT_NEEDED' },
      { decision: 'NOT_NEEDED', reason: '   ' },
    ];

    for (const body of bodies) {
      const response = await decide('NV-SALH', body);
      expect([response.status, call().codeOf(response)]).toEqual([422, 'VALIDATION_ERROR']);
    }
    expect(await decided()).toBe(0);
  });

  it('trưởng phòng cũ, IT Admin và Người duyệt chi không quyết thay: 403 NOT_REVIEWER, không dòng nào được quyết #17 #18 @B3', async () => {
    await world.actors.ensure('NV-CEO');

    for (const code of ['NV-ENGH', 'NV-ITA1', 'NV-CEO']) {
      const response = await decide(code, { decision: 'NOT_NEEDED', reason: 'Không dùng nữa' });
      expect([response.status, call().codeOf(response)]).toEqual([403, 'TRANSFER_REVIEW.NOT_REVIEWER']);
    }
    expect(await decided()).toBe(0);
    expect(await world.facts.count('provisioning_tasks', "kind = 'REVOKE'")).toBe(0);
  });

  it('trưởng phòng mới quyết kèm lý do; chỉ "vẫn cần" được rút lại một lần thành "không cần", sau đó 409 NOT_OPEN #17 #18 @B3', async () => {
    const first = await decide('NV-SALH', { decision: 'STILL_NEEDED', reason: 'Nhóm Kinh doanh vẫn dùng Jira' });

    expect(first.status).toBe(201);
    expect(call().data<{ review: { status: string }; item: { decision: string } }>(first)).toMatchObject({
      review: { status: 'COMPLETED' },
      item: { decision: 'STILL_NEEDED' },
    });
    expect(
      await world.facts.one<{ decision: string; reason: string }>(
        `SELECT decision::text, reason FROM transfer_review_items`,
      ),
    ).toEqual({ decision: 'STILL_NEEDED', reason: 'Nhóm Kinh doanh vẫn dùng Jira' });

    // The same decision again changes nothing.
    const again = await decide('NV-SALH', { decision: 'STILL_NEEDED', reason: 'Vẫn dùng' });
    expect([again.status, call().codeOf(again)]).toEqual([409, 'TRANSFER_REVIEW.NOT_OPEN']);
    expect(await world.facts.count('provisioning_tasks', "kind = 'REVOKE'")).toBe(0);

    // The one decision that can be taken back is still needed: once, to no longer needed, which opens the revocation.
    const taken = await decide('NV-SALH', { decision: 'NOT_NEEDED', reason: 'Đổi ý, nhóm đã chuyển công cụ' });
    expect(taken.status).toBe(201);
    expect(await world.facts.count('provisioning_tasks', "kind = 'REVOKE'")).toBe(1);

    const last = await decide('NV-SALH', { decision: 'STILL_NEEDED', reason: 'Lại cần' });
    expect([last.status, call().codeOf(last)]).toEqual([409, 'TRANSFER_REVIEW.NOT_OPEN']);
    expect(
      (await world.facts.one<{ decision: string }>(`SELECT decision::text FROM transfer_review_items`)).decision,
    ).toBe('NOT_NEEDED');
    expect(await world.facts.count('provisioning_tasks', "kind = 'REVOKE'")).toBe(1);
  });
});
