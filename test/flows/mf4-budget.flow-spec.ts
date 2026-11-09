import type { Response } from 'supertest';
import { FlowWorld } from '../support/flows/flow-world';

const PDF = 'application/pdf';

/**
 * MF-4, the part Wave 1 settled (test-plan section 6, F4-01 → F4-03): the head proposes the year with amounts only and a file, Finance
 * builds the version with the default reserve of 10 % (a different one needs its reason), the spending approver decides, and the
 * revisions and high-value thresholds of before are gone. Real sign-in, the seeded dataset, the bytes of the file through the fake
 * object storage and nothing else replaced.
 */
describe('MF-4 ngân sách năm: đề xuất → phiên bản → duyệt @MF4 @D1', () => {
  let world: FlowWorld;
  let year: number;
  let figma: string;

  const call = () => world.calls;
  const wire = (response: { body: unknown }) => (response.body as { data: Record<string, unknown> }).data;

  /** The head declares a file, the browser puts it, the head completes it: the id of the attachment. */
  const uploadedFile = async (headCode: string): Promise<string> => {
    const declared = await call().post(headCode, '/budget-proposals/attachments', {
      fileName: 'de-xuat-ngan-sach.pdf',
      contentType: PDF,
      sizeBytes: 2048,
    });
    expect(declared.status).toBe(201);
    const id = (wire(declared).attachment as { id: string }).id;
    const key = (
      await world.facts.one<{ object_key: string }>(`SELECT object_key FROM budget_attachments WHERE id = $1`, [id])
    ).object_key;
    world.storage.put(key, { contentLength: 2048, contentType: PDF });
    expect((await call().post(headCode, `/budget-attachments/${id}/complete`)).status).toBe(200);

    return id;
  };

  /** The head sends the proposal of the year: amounts only, no Cost Center and no currency. */
  const proposal = async (headCode: string, attachmentIds: string[] = []): Promise<string> => {
    const response = await call().post(headCode, '/budget-proposals', {
      year,
      lines: [
        { description: 'Figma cho nhóm thiết kế', planId: figma, seats: 3, amount: { amount: '13500000' } },
        { description: 'Công cụ khác', amount: { amount: '16500000' }, note: 'Chưa chọn nhà cung cấp' },
      ],
      attachmentIds,
    });
    expect(response.status).toBe(201);

    return (wire(response).proposal as { id: string }).id;
  };

  const versionState = async (id: string) =>
    (await world.facts.one<{ state: string }>(`SELECT state::text FROM budget_versions WHERE id = $1`, [id])).state;

  beforeAll(async () => {
    world = await FlowWorld.open();
    year = Number(call().today().slice(0, 4));
    figma = await call().planId('Figma Professional');
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  describe('F4-01 đề xuất chỉ có số tiền và tệp; dự phòng mặc định 10 % @MF4 @D1', () => {
    it('phòng Thiết kế chưa có ngân sách: trưởng phòng gửi, Finance lập, Người duyệt chi duyệt #14 12b @B2', async () => {
      const file = await uploadedFile('NV-DESH');
      const proposalId = await proposal('NV-DESH', [file]);
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

      expect((await call().post('NV-FIN1', `/budget-versions/${version.id}/submission`)).status).toBe(200);
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
        proposal: { state: 'REVIEWED', total: { amount: '30000000', currency: 'VND' } },
      });
    });

    it('sau khi có ngân sách, Request của phòng Thiết kế được trình lô và có bước duyệt chi #6 @B1', async () => {
      const id = await call().submitRequest('NV-DES1', figma);
      expect((await call().approveNeed('NV-DESH', id)).status).toBe(200);

      expect((await call().submitBatch('NV-DESH', [id])).status).toBe(201);

      const check = await call().get('NV-FIN1', `/access-requests/${id}/budget-check`);
      expect(check.status).toBe(200);
      expect(wire(check).budgetCheck).toMatchObject({
        route: 'SPEND_APPROVAL',
        primaryCode: 'BUDGET_OK',
        yearCount: 1,
        bindingTotal: { amount: '375000', currency: 'VND' },
      });
      expect(
        (await world.facts.one<{ state: string }>(`SELECT state::text FROM access_requests WHERE id = $1`, [id])).state,
      ).toBe('AWAITING_SPEND_DECISION');
    });
  });

  describe('F4-01 chỉ số tiền: Cost Center và tiền tệ không do client gửi @MF4 @D1', () => {
    it('đề xuất hoặc phiên bản gửi costCenterId, currency (kể cả trong tiền) ⟹ 422 chỉ đúng key đó, không ghi gì #14 @B2', async () => {
      const issuesOf = (response: Response) =>
        (call().detailsOf(response) as { issues: { path: string }[] }).issues.map((issue) => issue.path);
      const proposals = await world.facts.count('budget_proposals');
      const versions = await world.facts.count('budget_versions');
      const costCenter = (await world.facts.one<{ id: string }>(`SELECT id FROM cost_centers WHERE code = 'CC-FIN'`))
        .id;
      const valid = {
        year,
        lines: [{ description: 'Công cụ khác', amount: { amount: '1000000' } }],
        attachmentIds: [],
      };

      const withCostCenter = await call().post('NV-FINH', '/budget-proposals', { ...valid, costCenterId: costCenter });
      const withCurrency = await call().post('NV-FINH', '/budget-proposals', {
        ...valid,
        lines: [{ description: 'Công cụ khác', amount: { amount: '1000000', currency: 'VND' } }],
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

      for (const response of [withCostCenter, withCurrency, baseWithCurrency, versionWithCostCenter]) {
        expect(response.status).toBe(422);
        expect(call().codeOf(response)).toBe('VALIDATION_ERROR');
      }
      expect(issuesOf(withCostCenter)).toEqual(['']);
      expect(issuesOf(versionWithCostCenter)).toEqual(['']);
      expect(issuesOf(withCurrency)).toEqual(['lines.0.amount']);
      expect(issuesOf(baseWithCurrency)).toEqual(['base']);
      expect(await world.facts.count('budget_proposals')).toBe(proposals);
      expect(await world.facts.count('budget_versions')).toBe(versions);
      // The same proposal without the extra keys is accepted: the 422 came from the keys.
      expect((await call().post('NV-FINH', '/budget-proposals', valid)).status).toBe(201);
    });
  });

  describe('F4-01b dataset có ngân sách năm nay và năm sau @MF4 @D1', () => {
    it('Request 12 tháng của phòng Kỹ thuật đi thẳng tới duyệt chi, giữ chỗ cả hai năm #14 @B1', async () => {
      const chatgpt = await call().planId('ChatGPT Plus');
      const id = await call().submitRequest('NV-DEV2', chatgpt, { termMonths: 12 });
      expect((await call().approveNeed('NV-ENGH', id)).status).toBe(200);
      expect((await call().submitBatch('NV-ENGH', [id])).status).toBe(201);

      const state = (
        await world.facts.one<{ state: string }>(`SELECT state::text FROM access_requests WHERE id = $1`, [id])
      ).state;
      expect(state).toBe('AWAITING_SPEND_DECISION');
      expect(
        (await call().post('NV-CEO', `/access-requests/${id}/spend-approval`, { decision: 'APPROVE' })).status,
      ).toBe(200);
      expect(await world.facts.count('budget_commitments', 'request_id = $1', [id])).toBe(2);
    });
  });

  describe('F4-02 dự phòng khác 10 % phải có lý do; yêu cầu sửa và từ chối @MF4 @D1', () => {
    it('dự phòng khác 10 % không lý do ⟹ 422; có lý do thì gửi được; Người duyệt chi yêu cầu sửa, Finance sửa và gửi lại #14 @B2', async () => {
      const proposalId = await proposal('NV-ITOH');
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
      expect((await call().post('NV-FIN1', `/budget-versions/${id}/submission`)).status).toBe(200);

      expect(
        (
          await call().post('NV-CEO', `/budget-versions/${id}/decision`, {
            decision: 'REQUEST_CHANGES',
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

    it('Người duyệt chi từ chối một phiên bản khác phải nêu lý do #14 @B2', async () => {
      const proposalId = await proposal('NV-DEP');
      const created = await call().post('NV-FIN1', '/budget-versions', { proposalId, base: { amount: '30000000' } });
      const id = (wire(created).version as { id: string }).id;
      expect((await call().post('NV-FIN1', `/budget-versions/${id}/submission`)).status).toBe(200);

      const noReason = await call().post('NV-CEO', `/budget-versions/${id}/decision`, { decision: 'REJECT' });
      expect([noReason.status, call().codeOf(noReason)]).toEqual([422, 'VALIDATION_ERROR']);
      expect(await versionState(id)).toBe('SENT');
      expect(
        (
          await call().post('NV-CEO', `/budget-versions/${id}/decision`, {
            decision: 'REJECT',
            reason: 'Chưa cần năm nay',
          })
        ).status,
      ).toBe(200);
      expect(await versionState(id)).toBe('REJECTED');
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
});
