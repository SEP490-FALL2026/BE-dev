import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { pretendBusinessToday } from '../../support/pretend-today';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

interface TermsWire {
  termsUrl: string | null;
  lastReviewedOn: string | null;
  aiTraining: string | null;
  dataLocation: string | null;
  installLimit: { maxDevicesPerKey: number | null; note: string | null };
  commercialUse: string | null;
  cancellationRefund: string | null;
}

interface WarningWire {
  code: string;
  planId: string;
  planName: string;
  applicationName: string;
  subscriptionId: string;
  noticeDeadline: { value: string | null; source: string };
  baseDate: string;
  reviewFrom: string;
  lastReviewedOn: string | null;
}

interface TermsView {
  planId: string;
  applicable: boolean;
  sharingPolicy: string | null;
  terms: TermsWire | null;
  opinions: Array<{
    id: string;
    businessOwner: { employeeId: string; employeeCode: string; fullName: string };
    opinion: string;
    recordedBy: string;
    recordedAt: string;
  }>;
  warnings: WarningWire[];
}

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };
const SIX_POINTS = {
  termsUrl: 'https://www.figma.com/tos',
  lastReviewedOn: '2025-11-15',
  aiTraining: 'Dữ liệu nhập vào không dùng huấn luyện AI',
  dataLocation: 'Lưu trữ tại EU',
  installLimit: { note: 'Tối đa 2 thiết bị mỗi người' },
  commercialUse: 'Được dùng thương mại',
  cancellationRefund: 'Báo hủy trước 30 ngày, tự gia hạn, không hoàn tiền',
};

describe('plan terms and review alerts over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let businessOwner: { employeeId: string; code: string };
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      role: 'FINANCE',
      admin,
    });
    employee = await createActivatedAccount(ctx, seed, {
      code: 'E-EMP',
      email: 'emp@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
    const owner = await insertEmployeeFixture(ctx.app, seed, { code: 'E-OWN', email: 'owner@acme.vn' });
    businessOwner = { employeeId: owner.employeeId, code: 'E-OWN' };
  }, 120000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const today = (day: string) => pretendBusinessToday(ctx.app, day);

  interface PlanSetup {
    kind?: 'SAAS' | 'LICENSED' | 'INTERNAL';
    type?: string;
    pricing?: string;
  }
  const plan = async (setup: PlanSetup = {}): Promise<{ planId: string; applicationId: string }> => {
    const kind = setup.kind ?? 'SAAS';
    const application = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(it1))
        .send({
          name: unique('App'),
          kind,
          ...(kind === 'INTERNAL' ? {} : { vendorName: unique('Vendor') }),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: businessOwner.employeeId,
          communication: NO,
        })
        .expect(201),
    );
    const type = setup.type ?? (kind === 'INTERNAL' ? 'K5' : 'K2');
    const created = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({
          applicationId: application.id,
          name: unique('Plan'),
          provisioningType: type,
          ...(type === 'K5' ? {} : { pricingModel: setup.pricing ?? 'PER_SEAT', controlLevel: 'FULL' }),
        })
        .expect(201),
    );

    return { planId: created.id, applicationId: application.id };
  };
  /** An active term subscription of the plan, priced in the reporting currency so no rate is needed. */
  const subscription = async (planId: string, extra: object = {}): Promise<string> =>
    dataOf<{ id: string; status: string }>(
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({
          ownerDepartmentId: seed.departmentId,
          planId,
          kind: 'TERM',
          purchasedQuantity: 10,
          unitPrice: { amount: '1000000', currency: 'VND' },
          billingCycle: 'ANNUAL',
          startDate: '2026-01-01',
          ...extra,
        })
        .expect(201),
    ).id;
  const putTerms = (planId: string, body: object, account: ApiAccount = it1) =>
    request(server()).put(`/api/v1/plans/${planId}/terms`).set(as(account)).send(body);
  const getTerms = (planId: string, account: ApiAccount = it1) =>
    request(server()).get(`/api/v1/plans/${planId}/terms`).set(as(account));
  const postOpinion = (planId: string, body: object, account: ApiAccount = it1) =>
    request(server()).post(`/api/v1/plans/${planId}/term-opinions`).set(as(account)).send(body);
  const warningsOf = async (planId: string): Promise<WarningWire[]> =>
    dataOf<{ items: WarningWire[] }>(
      await request(server()).get('/api/v1/plan-warnings').query({ pageSize: 100 }).set(as(it1)).expect(200),
    ).items.filter((item) => item.planId === planId);
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        'SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;
  const n = async (table: string): Promise<number> =>
    (await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

  describe('recording the terms (AC-1, AC-2)', () => {
    it('AC-1: stores the link, the review date and the points as IT read them, shows the sharing policy kept on the plan, and audits before and after', async () => {
      const { planId } = await plan();
      await request(server())
        .patch(`/api/v1/plans/${planId}`)
        .set(as(it1))
        .send({ sharingPolicy: 'NOT_ALLOWED' })
        .expect(200);

      const saved = dataOf<{ terms: TermsWire; changed: boolean }>(await putTerms(planId, SIX_POINTS).expect(200));

      expect(saved.changed).toBe(true);
      expect(saved.terms).toMatchObject({
        termsUrl: 'https://www.figma.com/tos',
        lastReviewedOn: '2025-11-15',
        aiTraining: 'Dữ liệu nhập vào không dùng huấn luyện AI',
        dataLocation: 'Lưu trữ tại EU',
        installLimit: { maxDevicesPerKey: null, note: 'Tối đa 2 thiết bị mỗi người' },
        commercialUse: 'Được dùng thương mại',
        cancellationRefund: 'Báo hủy trước 30 ngày, tự gia hạn, không hoàn tiền',
      });
      const read = dataOf<TermsView>(await getTerms(planId).expect(200));
      expect(read).toMatchObject({ applicable: true, sharingPolicy: 'NOT_ALLOWED', opinions: [], warnings: [] });
      expect(read.terms).toMatchObject({ dataLocation: 'Lưu trữ tại EU' });
      const events = (await auditOf(planId)).filter((event) => event.action === 'PLAN_TERMS.SET');
      expect(events).toEqual([
        expect.objectContaining({
          before: null,
          after: expect.objectContaining({ dataLocation: 'Lưu trữ tại EU' }) as unknown,
          actor_roles: ['IT_ADMIN'],
        }),
      ]);
    });

    it('answers 200 changed false and records nothing for terms equal to the current ones, and replaces them as a whole otherwise', async () => {
      const { planId } = await plan();
      await putTerms(planId, SIX_POINTS).expect(200);

      const same = dataOf<{ changed: boolean }>(
        await putTerms(planId, { ...SIX_POINTS, aiTraining: ` ${SIX_POINTS.aiTraining}  ` }).expect(200),
      );
      expect(same.changed).toBe(false);
      const replaced = dataOf<{ terms: TermsWire; changed: boolean }>(
        await putTerms(planId, { commercialUse: 'Chỉ nội bộ' }).expect(200),
      );
      expect(replaced.changed).toBe(true);
      expect(replaced.terms).toMatchObject({
        commercialUse: 'Chỉ nội bộ',
        termsUrl: null,
        lastReviewedOn: null,
        aiTraining: null,
        dataLocation: null,
      });
      expect((await auditOf(planId)).filter((event) => event.action === 'PLAN_TERMS.SET')).toHaveLength(2);
    });

    it('lets the checklist be saved half filled, and the terms be saved empty (OQ-B-10)', async () => {
      const { planId } = await plan();

      const saved = dataOf<{ terms: TermsWire }>(await putTerms(planId, {}).expect(200));

      expect(saved.terms).toMatchObject({
        termsUrl: null,
        aiTraining: null,
        installLimit: { maxDevicesPerKey: null, note: null },
      });
    });

    it('AC-2: keeps the words IT wrote and has no field for a legal conclusion', async () => {
      const { planId } = await plan();
      const text = 'đọc điều khoản thấy chỉ cho dùng nội bộ';

      const saved = dataOf<{ terms: TermsWire }>(await putTerms(planId, { commercialUse: `  ${text} ` }).expect(200));

      expect(saved.terms.commercialUse).toBe(text);
      for (const body of [
        { legalVerdict: 'violates' },
        { compliant: false },
        { commercialUse: 'x', conclusion: 'illegal' },
        { sharingPolicy: 'ALLOWED' },
      ]) {
        expect(codeOf(await putTerms(planId, body).expect(422))).toBe('VALIDATION_ERROR');
      }
    });

    it('keeps the numeric install limit for a K4 plan only; any plan keeps it as text', async () => {
      const k4 = await plan({ kind: 'LICENSED', type: 'K4' });
      const k2 = await plan();

      const stored = dataOf<{ terms: TermsWire }>(
        await putTerms(k4.planId, { installLimit: { maxDevicesPerKey: 1, note: '1 máy mỗi khóa' } }).expect(200),
      );
      expect(stored.terms.installLimit).toEqual({ maxDevicesPerKey: 1, note: '1 máy mỗi khóa' });
      expect(codeOf(await putTerms(k2.planId, { installLimit: { maxDevicesPerKey: 2 } }).expect(422))).toBe(
        'PLAN_TERMS.INSTALL_LIMIT_NUMERIC_ONLY_FOR_K4',
      );
      await putTerms(k2.planId, { installLimit: { note: 'tối đa 2 thiết bị mỗi người' } }).expect(200);
      expect(codeOf(await putTerms(k4.planId, { installLimit: { maxDevicesPerKey: 0 } }).expect(422))).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('does not let a plan that keeps a numeric limit change to a kind that cannot hold one, and says why', async () => {
      const k4 = await plan({ kind: 'LICENSED', type: 'K4' });
      await putTerms(k4.planId, { installLimit: { maxDevicesPerKey: 1 } }).expect(200);

      const response = await request(server())
        .patch(`/api/v1/plans/${k4.planId}`)
        .set(as(it1))
        .send({ provisioningType: 'K1', pricingModel: 'FLAT_RATE', controlLevel: 'PARTIAL' })
        .expect(409);

      expect(codeOf(response)).toBe('PLAN.TERMS_BLOCK_TYPE_CHANGE');
    });

    it.each([
      ['a link that is not an address', { termsUrl: 'figma.com/tos' }, 'PLAN_TERMS.URL_INVALID'],
      ['a link that is not http or https', { termsUrl: 'ftp://example.com/terms' }, 'PLAN_TERMS.URL_INVALID'],
      ['a text over 2000 characters', { aiTraining: 'x'.repeat(2001) }, 'PLAN_TERMS.TEXT_INVALID'],
      ['a review date that has not come', { lastReviewedOn: '2999-01-01' }, 'PLAN_TERMS.REVIEW_DATE_IN_FUTURE'],
    ])('refuses %s: 422 %s and nothing recorded', async (_name, body, code) => {
      const { planId } = await plan();
      const before = await n('plan_terms');

      expect(codeOf(await putTerms(planId, body).expect(422))).toBe(code);
      expect(await n('plan_terms')).toBe(before);
    });
  });

  describe('the alert that the terms need a new review (AC-3, AC-4, AC-9)', () => {
    it('AC-3: with a deadline of 01/12/2026 and the last review on 15/11/2025, the alert opens on 16/11 and ends after 01/12', async () => {
      const { planId } = await plan();
      await putTerms(planId, { lastReviewedOn: '2025-11-15' }).expect(200);
      const subscriptionId = await subscription(planId, {
        renewalDate: '2026-12-31',
        noticeDeadline: '2026-12-01',
        autoRenew: true,
      });

      today('2026-11-15');
      expect(await warningsOf(planId)).toEqual([]);

      for (const day of ['2026-11-16', '2026-11-24', '2026-12-01']) {
        today(day);
        const [warning] = await warningsOf(planId);
        expect(warning).toMatchObject({
          code: 'TERMS_REVIEW_DUE',
          subscriptionId,
          noticeDeadline: { value: '2026-12-01', source: 'DECLARED' },
          baseDate: '2026-12-01',
          reviewFrom: '2026-11-16',
          lastReviewedOn: '2025-11-15',
        });
        expect(dataOf<TermsView>(await getTerms(planId).expect(200)).warnings).toHaveLength(1);
      }
      today('2026-12-02');
      expect(await warningsOf(planId)).toEqual([]);
    });

    it('AC-4: recording a review on or after the milestone closes the alert, one before it does not, and it is audited', async () => {
      const { planId } = await plan();
      await putTerms(planId, { lastReviewedOn: '2025-11-15' }).expect(200);
      await subscription(planId, { noticeDeadline: '2026-12-01', renewalDate: '2026-12-01' });

      today('2026-11-20');
      expect(await warningsOf(planId)).toHaveLength(1);
      await putTerms(planId, { lastReviewedOn: '2026-11-15' }).expect(200);
      expect(await warningsOf(planId)).toHaveLength(1);
      await putTerms(planId, {
        lastReviewedOn: '2026-11-20',
        cancellationRefund: 'Đã rà lại: báo trước 30 ngày',
      }).expect(200);

      expect(await warningsOf(planId)).toEqual([]);
      expect((await auditOf(planId)).filter((event) => event.action === 'PLAN_TERMS.SET')).toHaveLength(3);
      expect(await warningsOf(planId)).toEqual([]);
    });

    it('opens an alert for a plan that was never reviewed, and shows the plan, the application and the deadline source', async () => {
      const { planId } = await plan();
      await subscription(planId, { noticePeriodDays: 30, renewalDate: '2026-12-31' });

      today('2026-11-20');
      const [warning] = await warningsOf(planId);

      expect(warning).toMatchObject({
        planId,
        lastReviewedOn: null,
        noticeDeadline: { value: '2026-12-01', source: 'INFERRED_UNCONFIRMED' },
      });
      expect(warning.applicationName).toMatch(/^App /);
    });

    it('AC-9: a subscription with no deadline that ends on 31/12 and does not renew is alerted from its end date, marked as such', async () => {
      const { planId } = await plan({ pricing: 'FLAT_RATE', type: 'K1' });
      await subscription(planId, { endDate: '2026-12-31', autoRenew: false });

      today('2026-12-15');
      expect(await warningsOf(planId)).toEqual([]);
      today('2026-12-16');
      const [warning] = await warningsOf(planId);

      expect(warning).toMatchObject({
        noticeDeadline: { value: null, source: 'BY_END_DATE' },
        baseDate: '2026-12-31',
        reviewFrom: '2026-12-16',
      });
    });

    it('AC-9: a perpetual purchase, a draft and a subscription with no date to alert from raise no review alert', async () => {
      const licensed = await plan({ kind: 'LICENSED', type: 'K4' });
      const saas = await plan();
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({
          ownerDepartmentId: seed.departmentId,
          planId: licensed.planId,
          kind: 'PERPETUAL',
          purchasedQuantity: 50,
          unitPrice: { amount: '500000', currency: 'VND' },
          startDate: '2026-03-15',
        })
        .expect(201);
      await subscription(saas.planId, { autoRenew: true });
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({ ownerDepartmentId: seed.departmentId, planId: saas.planId, kind: 'TERM', endDate: '2026-12-31' })
        .expect(201);

      for (const day of ['2026-03-20', '2026-11-20', '2026-12-20']) {
        today(day);
        expect(await warningsOf(licensed.planId)).toEqual([]);
        expect(await warningsOf(saas.planId)).toEqual([]);
      }
    });

    it('lists the alerts of all plans with the earliest milestone first, in pages', async () => {
      const early = await plan();
      const late = await plan();
      await subscription(late.planId, { noticeDeadline: '2027-03-10', renewalDate: '2027-03-10' });
      await subscription(early.planId, { noticeDeadline: '2027-03-05', renewalDate: '2027-03-05' });

      today('2027-02-20');
      const all = dataOf<{ items: WarningWire[]; pagination: { totalItems: number }; asOf: string }>(
        await request(server()).get('/api/v1/plan-warnings').query({ pageSize: 100 }).set(as(it1)).expect(200),
      );
      const mine = all.items.filter((item) => [early.planId, late.planId].includes(item.planId));

      expect(mine.map((item) => item.planId)).toEqual([early.planId]);
      today('2027-02-25');
      const later = dataOf<{ items: WarningWire[] }>(
        await request(server()).get('/api/v1/plan-warnings').query({ pageSize: 100 }).set(as(it1)).expect(200),
      ).items.filter((item) => [early.planId, late.planId].includes(item.planId));
      expect(later.map((item) => item.planId)).toEqual([early.planId, late.planId]);
      expect(all.asOf).toBe('2027-02-20');
      const paged = dataOf<{ items: WarningWire[]; pagination: { pageSize: number } }>(
        await request(server()).get('/api/v1/plan-warnings').query({ page: 2, pageSize: 1 }).set(as(it1)).expect(200),
      );
      expect(paged.items).toHaveLength(1);
      expect(paged.pagination.pageSize).toBe(1);
    });
  });

  describe('the opinion of the Business Owner (AC-6)', () => {
    it('is kept with the Business Owner of the application, who recorded it and when, and adds no step', async () => {
      const { planId } = await plan();
      const before = { audit: (await auditOf(planId)).length };

      const recorded = dataOf<TermsView['opinions'][number]>(
        await postOpinion(planId, { opinion: '  Nên rà điều khoản chia sẻ   trước kỳ gia hạn ' }).expect(201),
      );

      expect(recorded).toMatchObject({
        businessOwner: { employeeId: businessOwner.employeeId, employeeCode: 'E-OWN' },
        opinion: 'Nên rà điều khoản chia sẻ trước kỳ gia hạn',
        recordedBy: it1.appUserId,
      });
      expect(new Date(recorded.recordedAt).getTime()).toBeGreaterThan(0);
      expect(dataOf<TermsView>(await getTerms(planId).expect(200)).opinions.map((item) => item.id)).toEqual([
        recorded.id,
      ]);
      const events = await auditOf(planId);
      expect(events).toHaveLength(before.audit + 1);
      expect(events[events.length - 1]).toMatchObject({
        action: 'PLAN_TERM_OPINION.RECORDED',
        actor_roles: ['IT_ADMIN'],
      });
      expect(await warningsOf(planId)).toEqual([]);
    });

    it('lists the newest opinion first, never changes one, and refuses an empty or over-long opinion', async () => {
      const { planId } = await plan();
      const first = dataOf<{ id: string }>(await postOpinion(planId, { opinion: 'first' }).expect(201));
      const second = dataOf<{ id: string }>(await postOpinion(planId, { opinion: 'second' }).expect(201));

      expect(dataOf<TermsView>(await getTerms(planId).expect(200)).opinions.map((item) => item.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(codeOf(await postOpinion(planId, { opinion: '   ' }).expect(422))).toBe('PLAN_TERMS.TEXT_INVALID');
      expect(codeOf(await postOpinion(planId, { opinion: 'x'.repeat(2001) }).expect(422))).toBe(
        'PLAN_TERMS.TEXT_INVALID',
      );
      await expect(
        ctx.sql.query(`UPDATE plan_term_opinions SET opinion = 'changed' WHERE id = $1`, [first.id]),
      ).rejects.toMatchObject({ code: '55000' });
    });
  });

  describe('a plan with no terms (AC-7)', () => {
    it('has no terms, no opinion and no alert for a K5 plan of an internal application', async () => {
      const { planId } = await plan({ kind: 'INTERNAL' });
      const before = await n('plan_terms');

      expect(codeOf(await putTerms(planId, SIX_POINTS).expect(422))).toBe('PLAN_TERMS.NOT_APPLICABLE');
      expect(codeOf(await postOpinion(planId, { opinion: 'x' }).expect(422))).toBe('PLAN_TERMS.NOT_APPLICABLE');
      expect(dataOf<TermsView>(await getTerms(planId).expect(200))).toMatchObject({
        applicable: false,
        terms: null,
        opinions: [],
        warnings: [],
      });
      expect(await warningsOf(planId)).toEqual([]);
      expect(await n('plan_terms')).toBe(before);
    });

    it('answers 404 PLAN.NOT_FOUND on every route for a plan that does not exist', async () => {
      const missing = randomUUID();

      expect(codeOf(await getTerms(missing).expect(404))).toBe('PLAN.NOT_FOUND');
      expect(codeOf(await putTerms(missing, {}).expect(404))).toBe('PLAN.NOT_FOUND');
      expect(codeOf(await postOpinion(missing, { opinion: 'x' }).expect(404))).toBe('PLAN.NOT_FOUND');
    });
  });

  describe('who may use it (AC-8)', () => {
    it('turns Finance, an employee and the Super Admin away from recording terms and opinions, and keeps Finance out of the alerts', async () => {
      const { planId } = await plan();
      await putTerms(planId, { aiTraining: 'as recorded' }).expect(200);
      const before = {
        terms: await n('plan_terms'),
        opinions: await n('plan_term_opinions'),
        audit: await n('audit_events'),
      };
      const asSuperAdmin = { Authorization: `Bearer ${admin}` };

      for (const account of [finance, employee]) {
        await putTerms(planId, { aiTraining: 'changed' }, account).expect(403);
        await postOpinion(planId, { opinion: 'x' }, account).expect(403);
      }
      await request(server()).put(`/api/v1/plans/${planId}/terms`).set(asSuperAdmin).send({}).expect(403);
      await request(server())
        .post(`/api/v1/plans/${planId}/term-opinions`)
        .set(asSuperAdmin)
        .send({ opinion: 'x' })
        .expect(403);

      expect({
        terms: await n('plan_terms'),
        opinions: await n('plan_term_opinions'),
        audit: await n('audit_events'),
      }).toEqual(before);
      expect(dataOf<TermsView>(await getTerms(planId).expect(200)).terms?.aiTraining).toBe('as recorded');
      await getTerms(planId, finance).expect(200);
      await getTerms(planId, employee).expect(403);
      await request(server()).get('/api/v1/plan-warnings').set(as(finance)).expect(403);
      await request(server()).get('/api/v1/plan-warnings').set(as(employee)).expect(403);
    });
  });
});
