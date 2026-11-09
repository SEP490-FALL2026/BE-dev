import { FlowWorld } from '../support/flows/flow-world';

const RANDOM_ID = '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10';

/**
 * MF-1, the part Wave 1 settled (test-plan sections 3, F1-02 → F1-04): what the API no longer takes, who may not act, and what a
 * second call does. Real sign-in per role, the seeded dataset, nothing mocked.
 */
describe('MF-1 request contract: field cũ, sai vai, gọi lại @MF1 @D1', () => {
  let world: FlowWorld;
  let figma: string;
  let pendingId: string;

  const call = () => world.calls;
  const count = (table: string) => world.facts.count(table);

  /** A body that carries a retired field is refused with 422 and nothing is written to the table it was meant for. */
  const refusedWithNothingWritten = async (
    table: string,
    send: () => Promise<{ status: number; body: unknown }>,
    expected: { status: number; code?: string } = { status: 422, code: 'VALIDATION_ERROR' },
  ) => {
    const before = await count(table);
    const response = await send();

    expect(response.status).toBe(expected.status);
    if (expected.code) expect((response.body as { error: { code: string } }).error.code).toBe(expected.code);
    expect(await count(table)).toBe(before);
  };

  beforeAll(async () => {
    world = await FlowWorld.open();
    figma = await call().planId('Figma Professional');
    pendingId = await call().submitRequest('NV-DEV3', figma);
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  describe('F1-02 field cũ ⟹ 422, không ghi @MF1 @D1', () => {
    it('Request cá nhân: ngày chi dự kiến và thời hạn 13 tháng bị từ chối, bỏ field thì gửi được #16 #15 @B3', async () => {
      await refusedWithNothingWritten('access_requests', () =>
        call().post('NV-DEV3', '/access-requests', {
          planId: figma,
          businessReason: 'x',
          termMonths: 1,
          expectedSpendOn: call().today(),
        }),
      );
      await refusedWithNothingWritten('access_requests', () =>
        call().post('NV-DEV3', '/access-requests', { planId: figma, businessReason: 'x', termMonths: 12 }),
      );
      const preview = await call().post('NV-DEV3', '/access-requests/preview', {
        planId: figma,
        termMonths: 1,
        expectedSpendOn: call().today(),
      });
      expect(preview.status).toBe(422);
      // The same body without the retired field is the only difference between a refusal and a Request.
      const jira = await call().planId('Jira Standard');
      const before = await count('access_requests');
      expect(
        (
          await call().post('NV-DEV3', '/access-requests', {
            planId: jira,
            businessReason: 'x',
            expectedEndDate: call().inDays(60),
          })
        ).status,
      ).toBe(201);
      expect(await count('access_requests')).toBe(before + 1);
    });

    it('quyết nhu cầu: xác nhận thời hạn, ngày chi và dòng kế hoạch bị từ chối #15 #16 12b @B3', async () => {
      const path = `/access-requests/${pendingId}/need-decision`;
      const state = () =>
        world.facts.one<{ state: string }>(`SELECT state::text FROM access_requests WHERE id = $1`, [pendingId]);
      const before = await state();

      for (const extra of [
        { termConfirmation: { reason: 'Cần dùng lâu' } },
        { spend: { expectedSpendOn: call().today() } },
        { spend: { planLine: { position: 1, stillNeeded: true } } },
        { spend: { offPlan: { reason: 'Ngoài kế hoạch' } } },
      ]) {
        const response = await call().post('NV-ENGH', path, { decision: 'APPROVE', ...extra });
        expect(response.status).toBe(422);
        expect(call().codeOf(response)).toBe('VALIDATION_ERROR');
      }
      expect(await state()).toEqual(before);
      expect(before.state).toBe('PENDING');
    });

    it('route gỡ: dòng kế hoạch của Request và Request ủy quyền không còn #4 12b @B1', async () => {
      expect((await call().put('NV-ENGH', `/access-requests/${pendingId}/plan-line`, {})).status).toBe(404);
      expect((await call().post('NV-ENGH', '/delegated-requests', {})).status).toBe(404);
    });

    it('ngân sách: dòng BM-10 còn khoảng mua, phiên bản còn ngưỡng giá trị cao ⟹ 422 #13 12b @B2', async () => {
      await refusedWithNothingWritten('budget_proposals', () =>
        call().post('NV-DESH', '/budget-proposals', {
          year: Number(call().today().slice(0, 4)),
          lines: [
            {
              description: 'Figma',
              planId: figma,
              seats: 2,
              amount: { amount: '1000000' },
              windowFrom: call().today(),
              lineType: 'RENEW',
              priorityRank: 1,
            },
          ],
        }),
      );
      const proposalLine = {
        description: 'Figma',
        planId: figma,
        seats: 2,
        amount: { amount: '1000000' },
        lineType: 'RENEW',
        priorityRank: 1,
      };
      const year = Number(call().today().slice(0, 4));
      const proposals = await count('budget_proposals');
      expect((await call().post('NV-DESH', '/budget-proposals', { year, lines: [proposalLine] })).status).toBe(201);
      expect(await count('budget_proposals')).toBe(proposals + 1);
      await refusedWithNothingWritten('budget_versions', () =>
        call().post('NV-FIN1', '/budget-versions', {
          proposalId: RANDOM_ID,
          base: { amount: '1000000' },
          highValuePercent: 10,
        }),
      );
    });

    it('Người duyệt chi: override khi duyệt chi và ngày kết thúc do IT đặt khi cấp ⟹ 422 #12 #4 @B2', async () => {
      const approval = await call().post('NV-CEO', `/access-requests/${pendingId}/spend-approval`, {
        decision: 'APPROVE',
        override: { reason: 'Vượt ngân sách', years: [2026] },
      });
      expect(approval.status).toBe(422);
      expect(call().codeOf(approval)).toBe('VALIDATION_ERROR');
      await refusedWithNothingWritten('provisioning_tasks', () =>
        call().post('NV-ITA1', '/provisioning-tasks', { requestId: pendingId, expectedEndDate: call().inDays(30) }),
      );
    });

    it('Request nhóm và Request tiếp tục: ngày kết thúc từng dòng, ngày kết thúc mới ⟹ 422 #20 #21 @B3', async () => {
      const group = await call().post('NV-ENGH', '/group-requests', {
        planId: figma,
        businessReason: 'Cả nhóm',
        lines: [
          { employeeId: await world.facts.employeeId('NV-DEV1'), expectedEndDate: call().inDays(60) },
          { employeeId: await world.facts.employeeId('NV-DEV2') },
        ],
      });
      expect(group.status).toBe(422);
      expect(call().codeOf(group)).toBe('VALIDATION_ERROR');
      const renewal = await call().post('NV-DEV1', '/access-requests/renewals', {
        assignmentId: RANDOM_ID,
        businessReason: 'Dùng tiếp',
        newExpectedEndDate: call().inDays(60),
      });
      expect(renewal.status).toBe(422);
      expect(call().codeOf(renewal)).toBe('VALIDATION_ERROR');
    });
  });

  describe('F1-03 sai vai, khác phòng, tự duyệt @MF1 @D1', () => {
    it('chỉ người được giao bước nhu cầu quyết; trưởng phòng khác và nhân viên bị chặn #B0 @B0', async () => {
      const path = `/access-requests/${pendingId}/need-decision`;

      const otherHead = await call().post('NV-DESH', path, { decision: 'APPROVE' });
      const employee = await call().post('NV-DEV1', path, { decision: 'APPROVE' });

      // A head of another department does not even learn that the request exists.
      expect(otherHead.status).toBe(404);
      expect(call().codeOf(otherHead)).toBe('ACCESS_REQUEST.NOT_FOUND');
      // Nor does a colleague of the same department who is not a party of the request.
      expect(employee.status).toBe(404);
      expect(call().codeOf(employee)).toBe('ACCESS_REQUEST.NOT_FOUND');
      expect(
        (await world.facts.one<{ state: string }>(`SELECT state::text FROM access_requests WHERE id = $1`, [pendingId]))
          .state,
      ).toBe('PENDING');
    });

    it('trình lô, duyệt chi và cấp đều có người của riêng nó #B0 @B0', async () => {
      expect((await call().approveNeed('NV-ENGH', pendingId)).status).toBe(200);
      const grant = async () =>
        call().post('NV-ITA1', '/provisioning-tasks', {
          requestId: pendingId,
          subscriptionId: await call().subscriptionOf('Figma Professional', 'ENG'),
        });

      const wrongHead = await call().submitBatch('NV-SALH', [pendingId]);
      expect(wrongHead.status).toBe(404);
      expect(call().codeOf(wrongHead)).toBe('ACCESS_REQUEST.NOT_FOUND');
      expect((await grant()).status).toBe(409);

      expect((await call().submitBatch('NV-ENGH', [pendingId])).status).toBe(201);
      const finance = await call().post('NV-FIN1', `/access-requests/${pendingId}/spend-approval`, {
        decision: 'APPROVE',
      });
      expect(finance.status).toBe(403);
      expect((await grant()).status).toBe(409);
      expect(await world.facts.count('budget_commitments', 'request_id = $1', [pendingId])).toBe(0);
    });

    it('IT Admin không tự thực hiện việc cấp cho chính mình khi còn IT Admin khác; IT Admin khác làm được #B0 @B0', async () => {
      const hr = await call().planId('Truy cập Cổng Nhân sự');
      const own = await call().submitRequest('NV-ITA1', hr, { termMonths: 12 });
      expect((await call().approveNeed('NV-ITOH', own)).status).toBe(200);

      // Another usable IT Admin exists: the grant of one's own request is refused before any task is queued (QĐ-77m, R-D1).
      const self = await call().post('NV-ITA1', '/provisioning-tasks', { requestId: own });
      expect(self.status).toBe(403);
      expect(call().codeOf(self)).toBe('PROVISIONING.ANOTHER_IT_ADMIN_NEEDED');
      const queued = await call().post('NV-ITA2', '/provisioning-tasks', { requestId: own });
      expect(queued.status).toBe(201);
      const taskId = call().data<{ task: { id: string } }>(queued).task.id;
      const other = await call().post('NV-ITA2', `/provisioning-tasks/${taskId}/claim`);

      expect(other.status).toBe(200);
      expect(
        (await call().post('NV-ITA2', `/provisioning-tasks/${taskId}/complete`, { evidence: 'Đã cấp' })).status,
      ).toBe(200);
    });
  });

  describe('F1-05 dùng dự phòng: trình lô, xác nhận, duyệt chi @MF1 @B2', () => {
    it('BR-MF1-06h: lô không lý do ⟹ chờ xác nhận; xác nhận bằng endpoint ⟹ bước chi mở; duyệt ⟹ một khoản cam kết #B2 @B2', async () => {
      const year = Number(call().today().slice(0, 4));
      const sql = world.ctx.sql;
      const version = await world.facts.one<{ id: string; base_minor: string; reserve_minor: string }>(
        `SELECT v.id, v.base_minor::text, v.reserve_minor::text
           FROM budget_versions v JOIN cost_centers c ON c.id = v.cost_center_id
          WHERE c.code = 'CC-ENG' AND v.year = $1 AND v.state = 'APPROVED'`,
        [year],
      );
      const total = BigInt(version.base_minor) + BigInt(version.reserve_minor);
      // The base is gone; what is left is left only with the reserve.
      await sql.query(`UPDATE budget_versions SET base_minor = 1, reserve_minor = $2 WHERE id = $1`, [
        version.id,
        String(total - 1n),
      ]);
      try {
        const id = await call().submitRequest('NV-DEV2', figma);
        expect((await call().approveNeed('NV-ENGH', id)).status).toBe(200);

        const sent = await call().submitBatch('NV-ENGH', [id]);
        expect(sent.status).toBe(201);
        const result = call().data<{ results: { outcome: string; reserveConfirmation: string }[] }>(sent).results[0];
        expect(result).toMatchObject({ outcome: 'AWAITING_RESERVE_CONFIRMATION', reserveConfirmation: 'NOT_GIVEN' });
        expect(
          await world.facts.count('access_request_steps', "request_id = $1 AND kind = 'SPEND_APPROVAL'", [id]),
        ).toBe(0);

        const confirmed = await call().post('NV-ENGH', `/access-requests/${id}/reserve-confirmation`, {
          reason: 'Cần cho đợt phát hành tháng này',
        });
        expect(confirmed.status).toBe(200);
        expect(call().data<{ reserveConfirmation: { result: string } }>(confirmed).reserveConfirmation).toMatchObject({
          result: 'SPEND_STEP_OPENED',
          confirmationKept: true,
        });

        const approved = await call().post('NV-CEO', `/access-requests/${id}/spend-approval`, { decision: 'APPROVE' });
        expect(approved.status).toBe(200);
        expect(await world.facts.count('budget_commitments', 'request_id = $1', [id])).toBe(1);
      } finally {
        await sql.query(`UPDATE budget_versions SET base_minor = $2, reserve_minor = $3 WHERE id = $1`, [
          version.id,
          version.base_minor,
          version.reserve_minor,
        ]);
      }
    });
  });

  describe('F1-04 gọi lại không tạo bản ghi trùng @MF1 @D1', () => {
    it('trình lô, duyệt chi và hoàn tất cấp: lần hai là 409 và không thêm dòng #B0 @B0', async () => {
      const id = await call().submitRequest('NV-DEV1', figma);
      expect((await call().approveNeed('NV-ENGH', id)).status).toBe(200);

      expect((await call().submitBatch('NV-ENGH', [id])).status).toBe(201);
      const again = await call().submitBatch('NV-ENGH', [id]);
      expect(again.status).toBe(409);
      expect(await world.facts.count('spend_batch_items', 'request_id = $1', [id])).toBe(1);

      expect(
        (await call().post('NV-CEO', `/access-requests/${id}/spend-approval`, { decision: 'APPROVE' })).status,
      ).toBe(200);
      const twice = await call().post('NV-CEO', `/access-requests/${id}/spend-approval`, { decision: 'APPROVE' });
      expect(twice.status).toBe(409);
      expect(call().codeOf(twice)).toBe('SPEND.NO_SPEND_STEP');
      expect(await world.facts.count('budget_commitments', 'request_id = $1', [id])).toBe(1);

      const subscriptionId = await call().subscriptionOf('Figma Professional', 'ENG');
      const task = await call().post('NV-ITA1', '/provisioning-tasks', { requestId: id, subscriptionId });
      expect(task.status).toBe(201);
      const taskId = call().data<{ task: { id: string } }>(task).task.id;
      expect((await call().post('NV-ITA1', `/provisioning-tasks/${taskId}/claim`)).status).toBe(200);
      expect(
        (await call().post('NV-ITA1', `/provisioning-tasks/${taskId}/complete`, { evidence: 'Đã thêm vào workspace' }))
          .status,
      ).toBe(200);
      expect(
        (await call().post('NV-ITA1', `/provisioning-tasks/${taskId}/complete`, { evidence: 'Lần hai' })).status,
      ).toBe(409);
      const dev1 = await world.facts.employeeId('NV-DEV1');
      expect(await world.facts.count('license_assignments', 'employee_id = $1 AND plan_id = $2', [dev1, figma])).toBe(
        1,
      );
    });
  });
});
