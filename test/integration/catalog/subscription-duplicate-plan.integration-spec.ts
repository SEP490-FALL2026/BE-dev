import request from 'supertest';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * `BR-MF1-09` / `QĐ-104k`(3) / R-E02 (spec `qd103-grant-from-shared-pool` §1) and F-012, real PostgreSQL: a second live subscription of a K2 or K4
 * plan is let through with the warning `SHOULD_MERGE` while the seat baseline is open and refused with 409 `SUBSCRIPTION.DUPLICATE_PLAN` once it is
 * closed; a renewal is never a duplicate; a draft counts as live. The API still asks for the owner department of a new subscription.
 */
describe('a second live subscription of a K2 or K4 plan (integration, real PostgreSQL)', () => {
  const body = (planId: string, extra: Record<string, unknown> = {}) => ({
    ownerDepartmentId: h.seed.departmentId,
    planId,
    kind: 'TERM',
    unitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle: 'MONTHLY',
    commitmentTermMonths: 1,
    startDate: '2026-01-05',
    purchasedQuantity: 5,
    responsibleItAdminEmployeeId: h.it1.employeeId,
    ...extra,
  });
  const post = (payload: object) => request(h.server()).post('/api/v1/subscriptions').set(h.as(h.it1)).send(payload);
  const complete = (id: string) => request(h.server()).post(`/api/v1/subscriptions/${id}/completions`).set(h.as(h.it1));
  const get = (id: string) => request(h.server()).get(`/api/v1/subscriptions/${id}`).set(h.as(h.it1));
  const warningsOf = (response: request.Response) => h.dataOf<{ warnings: string[] }>(response).warnings;
  const idOf = (response: request.Response) => h.dataOf<{ id: string }>(response).id;
  const draftOf = (planId: string) =>
    post({ ownerDepartmentId: h.seed.departmentId, planId, kind: 'TERM', purchasedQuantity: 3 });

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('while the seat baseline is open (R-E02 initial)', () => {
    it('lets a second K2 subscription through with SHOULD_MERGE, and reads it on both, in the answer and in the read', async () => {
      const planId = await h.plan('K2');
      const first = idOf(await post(body(planId)).expect(201));

      const second = await post(body(planId)).expect(201);

      expect(warningsOf(second)).toContain('SHOULD_MERGE');
      expect(h.dataOf<{ mergeCandidateIds: string[] }>(second).mergeCandidateIds).toEqual([first]);
      expect(warningsOf(await get(first).expect(200))).toContain('SHOULD_MERGE');
      const listed = h.dataOf<{ items: { id: string; warnings: string[] }[] }>(
        await request(h.server()).get('/api/v1/subscriptions').query({ planId }).set(h.as(h.it1)).expect(200),
      ).items;
      expect(listed.every((item) => item.warnings.includes('SHOULD_MERGE'))).toBe(true);
    });
  });

  // Before the closing of the baseline: the period after the first is a second live subscription of the plan, which only a open baseline allows here.
  describe('F-012: the flag that prices the plan follows the active period', () => {
    it('stays on the period a draft renewal continues until the draft is completed, then moves to it', async () => {
      const planId = await h.plan('K2');
      const previous = idOf(await post(body(planId)).expect(201));
      await request(h.server())
        .patch(`/api/v1/subscriptions/${previous}`)
        .set(h.as(h.it1))
        .send({ isPrimaryForPlan: true })
        .expect(200);
      // The draft renewal period of the first (the vendor confirmed it with data still missing): written by SQL, since only a renewal may point back.
      const next = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, purchased_quantity, unit_price_minor,
             unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
             price_reporting_currency, billing_cycle, commitment_term_months, start_date, responsible_it_admin_employee_id, auto_renew,
             allows_mid_term_reduction, renewed_from_id, updated_at)
           SELECT gen_random_uuid(), organization_id, plan_id, owner_department_id, kind, 'DRAFT', purchased_quantity, unit_price_minor,
                  unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
                  price_reporting_currency, billing_cycle, commitment_term_months, '2026-02-05', responsible_it_admin_employee_id, auto_renew,
                  allows_mid_term_reduction, id, now()
             FROM subscriptions WHERE id = $1
           RETURNING id`,
          [previous],
        )
      ).rows[0].id;
      const flags = async () =>
        (
          await h.ctx.sql.query<{ id: string; is_primary_for_plan: boolean }>(
            `SELECT id, is_primary_for_plan FROM subscriptions WHERE id IN ($1, $2)`,
            [previous, next],
          )
        ).rows.reduce<Record<string, boolean>>((all, row) => ({ ...all, [row.id]: row.is_primary_for_plan }), {});
      expect(await flags()).toEqual({ [previous]: true, [next]: false });

      await complete(next).expect(200);

      expect(await flags()).toEqual({ [previous]: false, [next]: true });
    });
  });

  describe('once the seat baseline is closed (R-E02 operation)', () => {
    let k2: string;
    let k4: string;
    let drafted: string;
    let draftId: string;
    let draftSibling: string;

    beforeAll(async () => {
      k2 = await h.plan('K2');
      k4 = await h.plan('K4');
      drafted = await h.plan('K2');
      draftSibling = await h.plan('K2');
      await post(body(k2)).expect(201);
      await post(body(k4)).expect(201);
      // A draft and its duplicate made while the baseline was open: the second is only warned about then.
      draftId = idOf(await draftOf(drafted).expect(201));
      const twin = await draftOf(drafted).expect(201);
      expect(warningsOf(twin)).toContain('SHOULD_MERGE');
      await post(body(draftSibling)).expect(201);
      await h.closeBaseline().expect(200);
    });

    it('refuses a second K2 subscription with 409 DUPLICATE_PLAN naming the live one', async () => {
      const refused = await post(body(k2)).expect(409);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
      expect(h.detailsOf(refused).subscriptionIds).toHaveLength(1);
    });

    it('refuses a second K4 subscription too', async () => {
      const refused = await post(body(k4)).expect(409);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
    });

    it('refuses a new subscription while a draft of the plan exists, and the completion of one of two drafts of the plan', async () => {
      expect(h.codeOf(await post(body(drafted)).expect(409))).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
      // Completing is the other way in: the draft has the data now, but its twin lives.
      await h.ctx.sql.query(
        `UPDATE subscriptions SET unit_price_minor = 100, unit_price_currency = 'VND', price_recorded_on = '2026-01-05',
                billing_cycle = 'MONTHLY', start_date = '2026-01-05', commitment_term_months = 1,
                responsible_it_admin_employee_id = $2 WHERE id = $1`,
        [draftId, h.it1.employeeId],
      );

      expect(h.codeOf(await complete(draftId).expect(409))).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
    });

    it('does not refuse a K1 subscription, a plan whose live subscription ended, nor one a later period continues', async () => {
      const k1 = await h.plan('K1');
      await post(body(k1, { purchasedQuantity: 3 })).expect(201);
      const secondK1 = await post(body(k1, { purchasedQuantity: 3 })).expect(201);
      expect(warningsOf(secondK1)).not.toContain('SHOULD_MERGE');

      // The only live subscription of the plan ended yesterday: its pool is no longer held.
      await h.ctx.sql.query(`UPDATE subscriptions SET end_date = current_date - 1 WHERE plan_id = $1`, [draftSibling]);
      await post(body(draftSibling)).expect(201);
    });

    it('keeps the answer of the read: the duplicate that existed before the closing still says SHOULD_MERGE', async () => {
      expect(warningsOf(await get(draftId).expect(200))).toContain('SHOULD_MERGE');
    });

    it('takes turns on the plan: of two declarations at once after the closing, one is 201 and the other 409, with no deadlock', async () => {
      const plan = await h.plan('K2');

      const answers = await Promise.all([post(body(plan)), post(body(plan))]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    });
  });
});
