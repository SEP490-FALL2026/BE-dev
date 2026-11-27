import request from 'supertest';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * `BR-MF1-09` / `QĐ-104k`(3) / R-E02 (spec `qd103-grant-from-shared-pool` §1) and F-012, real PostgreSQL: a second live subscription of a K2 or K4
 * plan is let through with the warning `SHOULD_MERGE` while the seat baseline is open and refused with 409 `SUBSCRIPTION.DUPLICATE_PLAN` once it is
 * closed; a renewal is never a duplicate; a draft counts as live. The API still asks for the owner department of a new subscription.
 */
describe('a second live subscription of a K2 or K4 plan (integration, real PostgreSQL)', () => {
  const body = (planId: string, extra: Record<string, unknown> = {}) => ({
    planId,
    kind: 'TERM',
    monthlyUnitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle: 'MONTHLY',
    commitmentTermMonths: 1,
    startDate: '2026-01-05',
    purchasedQuantity: 5,
    ...extra,
  });
  const secondWorkspaceFor = async (planId: string): Promise<string> => {
    const { rows } = await h.ctx.sql.query<{ vendor_id: string }>(
      `SELECT a.vendor_id FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1`,
      [planId],
    );
    const res = await request(h.server())
      .post('/api/v1/workspaces')
      .set(h.as(h.it1))
      .send({ vendorId: rows[0].vendor_id, name: h.unique('AltWorkspace') })
      .expect(201);
    const ws = h.dataOf<{ id: string; updatedAt: string }>(res);
    const it2 = await buildActivatedAccount(h.ctx, h.seed, {
      code: h.unique('E-IT2-DUP').replace(/\s+/g, ''),
      email: `${h.unique('it2dup').replace(/\s+/g, '').toLowerCase()}@acme.vn`,
      role: 'IT_ADMIN',
    });
    await request(h.server())
      .put(`/api/v1/workspaces/${ws.id}/admins`)
      .set(h.as(h.it1))
      .send({
        admins: [
          { employeeId: h.it1.employeeId, role: 'OWNER' },
          { employeeId: it2.employeeId, role: 'ADMIN' },
        ],
        primaryOwnerEmployeeId: h.it1.employeeId,
        expectedUpdatedAt: ws.updatedAt,
      })
      .expect(200);

    return ws.id;
  };
  const post = (payload: object) => request(h.server()).post('/api/v1/subscriptions').set(h.as(h.it1)).send(payload);
  const complete = (id: string) => request(h.server()).post(`/api/v1/subscriptions/${id}/completions`).set(h.as(h.it1));
  const get = (id: string) => request(h.server()).get(`/api/v1/subscriptions/${id}`).set(h.as(h.it1));
  const warningsOf = (response: request.Response) => h.dataOf<{ warnings: string[] }>(response).warnings;
  const idOf = (response: request.Response) => h.dataOf<{ id: string }>(response).id;
  const draftOf = (planId: string) => post({ planId, kind: 'TERM', purchasedQuantity: 3 });

  beforeAll(async () => {
    await h.start();
    // Once the baseline is closed a plan needs two IT Admins who work at the vendor (`QĐ-114ae`): the plans of this suite name this one beside the default one.
    await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT2', email: 'it2@acme.vn', role: 'IT_ADMIN' });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('W3-14: duplicate live (workspace, plan) is refused even while baseline is open; distinct workspace allowed', () => {
    it('refuses a second K2 subscription on the same workspace with 409 SUBSCRIPTION.DUPLICATE_PLAN and allows a distinct workspace', async () => {
      const planId = await h.plan('K2');
      const first = idOf(await post(body(planId)).expect(201));

      const duplicate = await post(body(planId)).expect(409);
      expect(h.codeOf(duplicate)).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
      expect(h.detailsOf(duplicate).subscriptionIds).toEqual([first]);

      const ws2 = await secondWorkspaceFor(planId);
      const second = await post(body(planId, { workspaceId: ws2 })).expect(201);
      expect(warningsOf(second)).not.toContain('SHOULD_MERGE');
      expect(warningsOf(await get(first).expect(200))).not.toContain('SHOULD_MERGE');
    });
  });

  describe('W3-14 & W3-15: a draft renewal period continues on the same workspace and completes cleanly', () => {
    it('does not count a renewal period as a duplicate and updates plan pricing on completion', async () => {
      const planId = await h.plan('K2');
      const previous = idOf(await post(body(planId)).expect(201));
      const { rows: wsRows } = await h.ctx.sql.query<{ workspace_id: string }>(
        `SELECT workspace_id FROM subscriptions WHERE id = $1`,
        [previous],
      );
      const next = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO subscriptions (id, organization_id, plan_id, workspace_id, kind, status, purchased_quantity, unit_price_minor,
             monthly_unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
             price_reporting_currency, billing_cycle, commitment_term_months, start_date, responsible_it_admin_employee_id, auto_renew,
             allows_mid_term_reduction, renewed_from_id, updated_at)
           SELECT gen_random_uuid(), organization_id, plan_id, workspace_id, kind, 'DRAFT', purchased_quantity, 1200000,
                  1200000, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, 1200000,
                  price_reporting_currency, billing_cycle, commitment_term_months, '2026-02-05', responsible_it_admin_employee_id, auto_renew,
                  allows_mid_term_reduction, id, now()
             FROM subscriptions WHERE id = $1
           RETURNING id`,
          [previous],
        )
      ).rows[0].id;
      await h.ctx.sql.query(`UPDATE subscriptions SET end_date = '2026-02-04' WHERE id = $1`, [previous]);
      await h.ctx.sql.query(
        `UPDATE subscription_lines SET closed_on = '2026-02-04', closed_reason = 'RENEWED' WHERE subscription_id = $1`,
        [previous],
      );

      const completed = await complete(next).expect(200);
      expect(h.dataOf<{ status: string; workspace: { id: string } | null }>(completed)).toMatchObject({
        status: 'ACTIVE',
        workspace: { id: wsRows[0].workspace_id },
      });
    });
  });

  describe('once the seat baseline is closed (R-E02 operation)', () => {
    let k2: string;
    let drafted: string;
    let draftId: string;
    let draftSibling: string;

    beforeAll(async () => {
      k2 = await h.plan('K2');
      drafted = await h.plan('K2');
      draftSibling = await h.plan('K2');
      await post(body(k2)).expect(201);
      draftId = idOf(await draftOf(drafted).expect(201));
      await post(body(draftSibling)).expect(201);
      await h.closeBaseline().expect(200);
    });

    it('refuses a second K2 subscription in the same workspace with 409 DUPLICATE_PLAN naming the live one', async () => {
      const refused = await post(body(k2)).expect(409);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
      expect(h.detailsOf(refused).subscriptionIds).toHaveLength(1);
    });

    it('refuses PERPETUAL on POST /subscriptions (W3-24) and allows a K2 lot/subscription on a second workspace', async () => {
      const k4 = await h.plan('K4');
      const perpetual = await post({
        planId: k4,
        kind: 'PERPETUAL',
        unitPrice: { amount: '1000000', currency: 'VND' },
        startDate: '2026-01-05',
        purchasedQuantity: 5,
      }).expect(422);
      expect(h.codeOf(perpetual)).toBe('SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT');

      const ws2 = await secondWorkspaceFor(k2);
      await post(body(k2, { workspaceId: ws2 })).expect(201);
    });

    it('refuses a new subscription while a draft of the plan exists, and completing a conflicting draft on the same workspace', async () => {
      expect(h.codeOf(await post(body(drafted)).expect(409))).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
      const ws2 = await secondWorkspaceFor(drafted);
      const { rows: activeRows } = await h.ctx.sql.query<{ workspace_id: string }>(
        `SELECT workspace_id FROM subscriptions WHERE id = $1`,
        [draftId],
      );
      await post(body(drafted, { workspaceId: ws2 })).expect(201);
      const conflictDraft = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO subscriptions (id, organization_id, plan_id, workspace_id, kind, status, purchased_quantity, unit_price_minor,
             monthly_unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
             price_reporting_currency, billing_cycle, commitment_term_months, start_date, responsible_it_admin_employee_id, auto_renew,
             allows_mid_term_reduction, updated_at)
           SELECT gen_random_uuid(), organization_id, plan_id, $2::uuid, kind, 'DRAFT', 3, 100000,
                  100000, 'VND', '2026-01-05', 1, '2026-01-05', 'SAME_CURRENCY', 100000,
                  'VND', 'MONTHLY', 1, '2026-01-05', $3, false, false, now()
             FROM subscriptions WHERE id = $1
           RETURNING id`,
          [draftId, activeRows[0].workspace_id, h.it1.employeeId],
        )
      ).rows[0].id;

      expect(h.codeOf(await complete(conflictDraft).expect(409))).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
    });

    it('refuses a K1 subscription (W3-27), and does not refuse a plan whose live subscription ended', async () => {
      const k1 = await h.plan('K1');
      expect(h.codeOf(await post(body(k1, { purchasedQuantity: 3 })).expect(422))).toBe(
        'SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION',
      );

      // The only live subscription of the plan ended yesterday: its pool is no longer held.
      await h.ctx.sql.query(`UPDATE subscriptions SET end_date = current_date - 1 WHERE plan_id = $1`, [draftSibling]);
      await h.ctx.sql.query(
        `UPDATE subscription_lines SET closed_on = current_date - 1, closed_reason = 'ENDED'
          WHERE subscription_id IN (SELECT id FROM subscriptions WHERE plan_id = $1)`,
        [draftSibling],
      );
      await post(body(draftSibling)).expect(201);
    });

    it('keeps reading a draft cleanly with no SHOULD_MERGE warning', async () => {
      const res = await get(draftId).expect(200);
      expect(warningsOf(res)).not.toContain('SHOULD_MERGE');
    });

    it('takes turns on the plan: of two declarations at once after the closing, one is 201 and the other 409, with no deadlock', async () => {
      const plan = await h.plan('K2');

      const answers = await Promise.all([post(body(plan)), post(body(plan))]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    });
  });
});
