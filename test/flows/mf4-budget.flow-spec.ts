import type { Response } from 'supertest';
import { bm10Body, budgetFile } from '../support/flows/flow-budget';
import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-4 (`QĐ-111z`…`QĐ-111ad`, BG-1/BG-2, test-plan section 6): Finance makes a cycle a draft and opens it, each head sends `BM-10` (one amount
 * and its files) while it is open, the cycle locks the day after its deadline, Finance builds each version (from `BM-10`, or from the baseline
 * for a department that sent nothing) with the default reserve of 10 % (a different one needs its reason), sends it with a file of its own,
 * and the spending approver approves it or returns it with a reason. Real sign-in, the seeded dataset, the bytes of the files through the
 * fake object storage, a clock the test moves, and nothing else replaced.
 *
 * The dataset (`shared-demo-v4`, DEMO-15): the cycle of the year is open until the day of the seed and every department with a head holds
 * its approved version; the cycle of the next year is open with Engineering approved, IT's BM-10 waiting, Marketing's version sent and
 * Sales' returned; the cycle of the year after is a draft. The scenarios that send BM-10 work on the next year (Design, Finance and the
 * Board sent nothing), the whole cycle on the year after.
 */
describe('MF-4 ngân sách năm: nháp → mở → BM-10 → chốt → phiên bản → duyệt/trả về @MF4 @D1', () => {
  let world: FlowWorld;
  /** The year the scenarios propose for: the year after the one of the clock (see the note above). */
  let year: number;
  let figma: string;

  const call = () => world.calls;
  const wire = (response: { body: unknown }) => (response.body as { data: Record<string, unknown> }).data;

  /** The head sends BM-10 of a year with one uploaded file: the id of the proposal. */
  const proposal = async (headCode: string, forYear = year, amount = '30000000'): Promise<string> => {
    const response = await call().post(headCode, '/budget-proposals', await bm10Body(world, headCode, forYear, amount));
    expect(response.status).toBe(201);

    return (wire(response).proposal as { id: string }).id;
  };

  /** Finance sends a version with a file of its own (a version is sent with at least one). */
  const sendVersion = async (id: string) => {
    await budgetFile(world, 'NV-FIN1', `/budget-versions/${id}/attachments`);

    return call().post('NV-FIN1', `/budget-versions/${id}/submission`);
  };

  const versionState = async (id: string) =>
    (await world.facts.one<{ state: string }>(`SELECT state::text FROM budget_versions WHERE id = $1`, [id])).state;

  beforeAll(async () => {
    world = await FlowWorld.open();
    year = Number(call().today().slice(0, 4)) + 1;
    figma = await call().planId('Figma Professional');
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  describe('F4-01 đề xuất chỉ có số tiền và tệp; dự phòng mặc định 10 % @MF4 @D1', () => {
    it('phòng Thiết kế chưa có ngân sách năm sau: trưởng phòng gửi, Finance lập, Người duyệt chi duyệt #14 12b @B2', async () => {
      const proposalId = await proposal('NV-DESH');
      expect(await world.facts.count('budget_proposals', 'id = $1', [proposalId])).toBe(1);

      // Finance names the base only: the reserve is the default share and the server gives it a currency and a Cost Center.
      const created = await call().post('NV-FIN1', '/budget-versions', { proposalId, base: { amount: '30000000' } });
      expect(created.status).toBe(201);
      const version = wire(created).version as { id: string; reserve: { amount: string }; base: { amount: string } };
      expect(version.base.amount).toBe('30000000');
      expect(Number(version.reserve.amount)).toBe(3000000);
      const row = await world.facts.one<{
        currency: string;
        reserve_percent: number;
        cost_center_code: string;
        state: string;
      }>(
        `SELECT v.currency, v.reserve_percent, c.code AS cost_center_code, v.state::text AS state
           FROM budget_versions v JOIN cost_centers c ON c.id = v.cost_center_id WHERE v.id = $1`,
        [version.id],
      );
      expect(row).toEqual({ currency: 'VND', reserve_percent: 10, cost_center_code: 'CC-DES', state: 'DRAFT' });

      // A version is sent with a file of its own (`BUDGET_VERSION.ATTACHMENT_REQUIRED` without one).
      const bare = await call().post('NV-FIN1', `/budget-versions/${version.id}/submission`);
      expect([bare.status, call().codeOf(bare)]).toEqual([422, 'BUDGET_VERSION.ATTACHMENT_REQUIRED']);
      expect((await sendVersion(version.id)).status).toBe(200);
      expect(await versionState(version.id)).toBe('SENT');
      expect(
        (await call().post('NV-CEO', `/budget-versions/${version.id}/decision`, { decision: 'APPROVE' })).status,
      ).toBe(200);
      expect(await versionState(version.id)).toBe('APPROVED');

      const mine = await call().get('NV-DESH', `/budgets/mine?year=${year}`);
      expect(mine.status).toBe(200);
      // The base 30 000 000 and the default reserve 3 000 000 make the 33 000 000 of the year; the proposal keeps its own total.
      expect(wire(mine).budget).toMatchObject({
        costCenter: { code: 'CC-DES' },
        year,
        status: 'ACTIVE',
        total: { amount: '33000000', currency: 'VND' },
        version: { number: 1 },
        proposal: { state: 'REVIEWED' },
      });
    });

    it('phòng có ngân sách của năm: Request của phòng Kỹ thuật được trình lô và có bước duyệt chi #6 @B1', async () => {
      // Design already holds Figma (nobody of the department is without it) and its budget of the year is a few hundred thousand: the
      // department with the room the scenario needs is Engineering, whose budget the dataset made wide.
      const id = await call().submitRequest('NV-DEV3', figma);
      expect((await call().approveNeed('NV-ENGH', id)).status).toBe(200);

      expect((await call().submitBatch('NV-ENGH', [id])).status).toBe(201);

      const check = await call().get('NV-FIN1', `/access-requests/${id}/budget-check`);
      expect(check.status).toBe(200);
      expect(wire(check).budgetCheck).toMatchObject({
        route: 'SPEND_APPROVAL',
        primaryCode: 'BUDGET_OK',
        yearCount: 1,
        // The price of the month (375 000) for the months left of the year, the month of today counted whole (BR-MF1-06).
        bindingTotal: { amount: String(375_000 * (12 - Number(call().today().slice(5, 7)) + 1)), currency: 'VND' },
      });
      expect(
        (await world.facts.one<{ state: string }>(`SELECT state::text FROM access_requests WHERE id = $1`, [id])).state,
      ).toBe('AWAITING_SPEND_DECISION');
    });
  });

  describe('F4-01 chỉ số tiền: Cost Center chỉ để chọn đơn vị của chính mình, tiền tệ không do client gửi @MF4 @D1', () => {
    it('đề xuất gửi Cost Center của phòng khác ⟹ 403; phiên bản gửi costCenterId, mọi chỗ gửi currency ⟹ 422 chỉ đúng key đó; không ghi gì #14 @B2', async () => {
      const issuesOf = (response: Response) =>
        (call().detailsOf(response) as { issues: { path: string }[] }).issues.map((issue) => issue.path);
      const proposals = await world.facts.count('budget_proposals');
      const versions = await world.facts.count('budget_versions');
      const costCenter = (await world.facts.one<{ id: string }>(`SELECT id FROM cost_centers WHERE code = 'CC-DES'`))
        .id;
      const valid = await bm10Body(world, 'NV-FINH', year, '1000000');

      const withCostCenter = await call().post('NV-FINH', '/budget-proposals', { ...valid, costCenterId: costCenter });
      const withCurrency = await call().post('NV-FINH', '/budget-proposals', {
        ...valid,
        requestedAmount: { amount: '1000000', currency: 'VND' },
      });
      const baseWithCurrency = await call().post('NV-FIN1', '/budget-versions', {
        proposalId: '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10',
        base: { amount: '1000000', currency: 'VND' },
      });
      const versionWithCostCenter = await call().post('NV-FIN1', '/budget-versions', {
        proposalId: '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10',
        base: { amount: '1000000' },
        costCenterId: costCenter,
      });

      // A head may name a Cost Center only to choose among the units they answer for (`QĐ-106k`): the Cost Center of another department is refused.
      expect(withCostCenter.status).toBe(403);
      expect(call().codeOf(withCostCenter)).toBe('BUDGET.NOT_YOUR_COST_CENTER');
      for (const response of [withCurrency, baseWithCurrency, versionWithCostCenter]) {
        expect(response.status).toBe(422);
        expect(call().codeOf(response)).toBe('VALIDATION_ERROR');
      }
      expect(issuesOf(versionWithCostCenter)).toEqual(['']);
      expect(issuesOf(withCurrency)).toEqual(['requestedAmount']);
      expect(issuesOf(baseWithCurrency)).toEqual(['base']);
      expect(await world.facts.count('budget_proposals')).toBe(proposals);
      expect(await world.facts.count('budget_versions')).toBe(versions);
      // The same proposal without the extra keys is accepted: the 422 came from the keys.
      expect((await call().post('NV-FINH', '/budget-proposals', valid)).status).toBe(201);
    });
  });

  describe('F4-01b dataset có ngân sách năm nay và năm sau @MF4 @D1', () => {
    it('Request 9 tháng (mức tối đa của gói mua theo tháng) của phòng Kỹ thuật đi thẳng tới duyệt chi, giữ chỗ một khoản cho năm của số tiền (QĐ-109) #14 @B1', async () => {
      const chatgpt = await call().planId('ChatGPT Plus');
      // ChatGPT Plus is bought by the month (K1): it takes 1 to 9 months and never more (QĐ-111i).
      const id = await call().submitRequest('NV-DEV2', chatgpt, { termMonths: 9 });
      expect((await call().approveNeed('NV-ENGH', id)).status).toBe(200);
      expect((await call().submitBatch('NV-ENGH', [id])).status).toBe(201);

      const state = (
        await world.facts.one<{ state: string }>(`SELECT state::text FROM access_requests WHERE id = $1`, [id])
      ).state;
      expect(state).toBe('AWAITING_SPEND_DECISION');
      expect(
        (await call().post('NV-CEO', `/access-requests/${id}/spend-approval`, { decision: 'APPROVE' })).status,
      ).toBe(200);
      // Rewritten from "giữ chỗ cả hai năm": một Request có một số tiền cho một năm, không có lịch trả nhiều năm.
      expect(await world.facts.count('budget_commitments', 'request_id = $1', [id])).toBe(1);
    });
  });

  describe('F4-02 dự phòng khác 10 % phải có lý do; yêu cầu sửa và từ chối @MF4 @D1', () => {
    it('dự phòng khác 10 % không lý do ⟹ 422; có lý do thì gửi được; Người duyệt chi yêu cầu sửa, Finance sửa và gửi lại #14 @B2', async () => {
      // IT's proposal of the year is the one the dataset left waiting for Finance: the version is built from it.
      const proposalId = (
        await world.facts.one<{ id: string }>(
          `SELECT p.id FROM budget_proposals p JOIN cost_centers c ON c.id = p.cost_center_id
            WHERE c.code = 'CC-ITO' AND p.year = $1 AND p.state = 'SUBMITTED'`,
          [year],
        )
      ).id;
      const created = await call().post('NV-FIN1', '/budget-versions', {
        proposalId,
        base: { amount: '30000000' },
        reserve: { amount: '6000000' },
      });
      // A reserve other than the default is accepted as a draft; it is the sending that asks for its reason.
      expect(created.status).toBe(201);
      const id = (wire(created).version as { id: string }).id;

      const without = await call().post('NV-FIN1', `/budget-versions/${id}/submission`);
      expect(without.status).toBe(422);
      expect(call().codeOf(without)).toBe('BUDGET.RESERVE_REASON_REQUIRED');
      expect(await versionState(id)).toBe('DRAFT');

      const updated = await call().put('NV-FIN1', `/budget-versions/${id}`, {
        reserve: { amount: '6000000' },
        reserveReason: 'Có hai hợp đồng gia hạn giữa năm',
      });
      expect(updated.status).toBe(200);
      expect((await sendVersion(id)).status).toBe(200);

      expect(
        (
          await call().post('NV-CEO', `/budget-versions/${id}/decision`, {
            decision: 'RETURN',
            reason: 'Giải trình thêm dự phòng',
          })
        ).status,
      ).toBe(200);
      expect(await versionState(id)).toBe('CHANGES_REQUESTED');
      expect((await call().put('NV-FIN1', `/budget-versions/${id}`, { reserve: { amount: '3000000' } })).status).toBe(
        200,
      );
      expect((await call().post('NV-FIN1', `/budget-versions/${id}/submission`)).status).toBe(200);
      expect(await versionState(id)).toBe('SENT');
    });

    it('Người duyệt chi trả về một phiên bản khác phải nêu lý do; không còn từ chối (QĐ-111ad) #14 @B2', async () => {
      const proposalId = await proposal('NV-DEP');
      const created = await call().post('NV-FIN1', '/budget-versions', { proposalId, base: { amount: '30000000' } });
      const id = (wire(created).version as { id: string }).id;
      expect((await sendVersion(id)).status).toBe(200);

      const noReason = await call().post('NV-CEO', `/budget-versions/${id}/decision`, { decision: 'RETURN' });
      expect([noReason.status, call().codeOf(noReason)]).toEqual([422, 'VALIDATION_ERROR']);
      const refusal = await call().post('NV-CEO', `/budget-versions/${id}/decision`, {
        decision: 'REJECT',
        reason: 'Chưa cần năm nay',
      });
      expect([refusal.status, call().codeOf(refusal)]).toEqual([422, 'VALIDATION_ERROR']);
      expect(await versionState(id)).toBe('SENT');
      expect(
        (
          await call().post('NV-CEO', `/budget-versions/${id}/decision`, {
            decision: 'RETURN',
            reason: 'Chưa cần năm nay',
          })
        ).status,
      ).toBe(200);
      expect(await versionState(id)).toBe('CHANGES_REQUESTED');
    });
  });

  describe('F4-03 bỏ revision và ngưỡng giá trị cao; ai không được quyết hoặc xem thì bị chặn @MF4 @D1', () => {
    it('route revision gỡ ⟹ 404; ngưỡng giá trị cao ⟹ 422 và không ghi gì #13 @B2', async () => {
      const before = await world.facts.count('budget_versions');

      const revision = await call().post('NV-FIN1', '/budget-versions/revisions', {});
      const threshold = await call().post('NV-FIN1', '/budget-versions', {
        proposalId: '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10',
        base: { amount: '1000000' },
        highValuePercent: 10,
      });

      expect(revision.status).toBe(404);
      expect(threshold.status).toBe(422);
      expect(call().codeOf(threshold)).toBe('VALIDATION_ERROR');
      expect(await world.facts.count('budget_versions')).toBe(before);
    });

    it('Finance không quyết phiên bản; trưởng phòng không đọc ngân sách phòng khác #14 @B2', async () => {
      const sent = await world.facts.one<{ id: string }>(
        `SELECT id FROM budget_versions WHERE state = 'SENT' OR state = 'CHANGES_REQUESTED' ORDER BY created_at DESC LIMIT 1`,
      );

      const finance = await call().post('NV-FIN1', `/budget-versions/${sent.id}/decision`, { decision: 'APPROVE' });
      const other = await call().get('NV-DESH', `/budget-versions/${sent.id}`);

      expect(finance.status).toBe(403);
      expect([other.status, call().codeOf(other)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    });
  });
  describe('F4-04 vòng đời kỳ: nháp → mở → BM-10 → chốt sau hạn → phiên bản từ BM-10 hoặc số liệu nền → duyệt/trả về @MF4 @D1', () => {
    it('kỳ nháp không nhận BM-10; Finance dời hạn (nháp không cần lý do) rồi mở; trưởng phòng nộp; sau hạn kỳ khóa; Finance lập và gửi; Người duyệt chi duyệt một, trả về một #14 @B2', async () => {
      const draftYear = year + 1;
      const cycle = async () => wire(await call().get('NV-FIN1', `/budget-cycles/${draftYear}`)) as { status: string };
      expect((await cycle()).status).toBe('DRAFT');

      // A draft takes no BM-10 (`QĐ-111z`).
      const early = await call().post(
        'NV-DESH',
        '/budget-proposals',
        await bm10Body(world, 'NV-DESH', draftYear, '1000'),
      );
      expect([early.status, call().codeOf(early)]).toEqual([409, 'BUDGET_CYCLE.NOT_OPEN']);

      // Finance moves the deadline of the draft to three days from today (no reason for a draft) and opens it.
      const moved = await call().as('NV-FIN1', 'patch', `/budget-cycles/${draftYear}`, {
        submissionDeadline: call().inDays(3),
        decisionDeadline: call().inDays(10),
      });
      expect(moved.status).toBe(200);
      expect((await call().post('NV-FIN1', `/budget-cycles/${draftYear}/opening`)).status).toBe(201);
      expect((await cycle()).status).toBe('OPEN');

      const design = await proposal('NV-DESH', draftYear, '40000000');
      const finance = await proposal('NV-FINH', draftYear, '20000000');

      // The day after the deadline the cycle is locked: a late BM-10 is refused, and nothing reopens it.
      world.clock.jumpDays(4);
      for (const code of ['NV-FIN1', 'NV-DEP', 'NV-CEO']) await world.actors.signIn(code);
      expect((await cycle()).status).toBe('LOCKED');
      const late = await call().post('NV-DEP', '/budget-proposals', await bm10Body(world, 'NV-DEP', draftYear, '1000'));
      expect([late.status, call().codeOf(late)]).toEqual([409, 'BUDGET_CYCLE.LOCKED']);

      // The Board sent nothing: Finance builds its version from the baseline, flagged as having no proposal.
      const board = (await world.facts.one<{ id: string }>(`SELECT id FROM cost_centers WHERE code = 'CC-BOD'`)).id;
      const baseline = await call().post('NV-FIN1', '/budget-versions', {
        source: 'BASELINE',
        costCenterId: board,
        year: draftYear,
      });
      expect(baseline.status).toBe(201);
      const baselineId = (wire(baseline).version as { id: string }).id;
      expect(wire(await call().get('NV-FIN1', `/budget-versions/${baselineId}`)).version).toMatchObject({
        origin: 'BASELINE_NO_PROPOSAL',
        noProposalSubmitted: true,
      });

      // Design's BM-10 becomes a version that is approved; Finance's is returned with its reason.
      const approve = await call().post('NV-FIN1', '/budget-versions', {
        proposalId: design,
        base: { amount: '40000000' },
      });
      const approveId = (wire(approve).version as { id: string }).id;
      expect((await sendVersion(approveId)).status).toBe(200);
      expect(
        (await call().post('NV-CEO', `/budget-versions/${approveId}/decision`, { decision: 'APPROVE' })).status,
      ).toBe(200);
      expect(await versionState(approveId)).toBe('APPROVED');

      const back = await call().post('NV-FIN1', '/budget-versions', {
        proposalId: finance,
        base: { amount: '20000000' },
      });
      const backId = (wire(back).version as { id: string }).id;
      expect((await sendVersion(backId)).status).toBe(200);
      const returned = await call().post('NV-CEO', `/budget-versions/${backId}/decision`, {
        decision: 'RETURN',
        reason: 'Thiếu bảng kê thuê bao cần gia hạn',
      });
      expect(returned.status).toBe(200);
      expect(await versionState(backId)).toBe('CHANGES_REQUESTED');
    });
  });
});
