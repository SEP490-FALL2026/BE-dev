import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/**
 * `W3-17` P13a, real PostgreSQL: K1 plans (monthly `1` and annual `12`) grant personal rights directly against the plan
 * with no subscription: zero rows touched in `subscriptions` / `seat_changes`, `license_assignments.subscription_id IS NULL`,
 * and `personal_commitment_months` + `billing_anchor_on` populated so `license_assignments_k1_terms` trigger succeeds.
 */
describe('W3-17 P13a: K1 grant without subscription (integration, real PostgreSQL)', () => {
  const createK1Plan = async (commitment: 1 | 12): Promise<string> => {
    const applicationId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique(`K1App-${commitment}`),
      kind: 'SAAS',
      vendorName: h.unique(`K1Vendor-${commitment}`),
      dataSensitivity: 'LOW',
    });

    return declarePlan(h.ctx, h.it1.accessToken, {
      applicationId,
      name: h.unique(`K1Plan-${commitment}`),
      provisioningType: 'K1',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
      referencePrice: { amount: '450000', currency: 'VND' },
      referenceCommitmentMonths: commitment,
    });
  };

  beforeAll(async () => {
    await h.start();
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      h.seed.departmentId,
      h.it1.employeeId,
    ]);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('grants K1 monthly (1m) and K1 annual (12m) with subscription_id IS NULL, personal_commitment_months, billing_anchor_on, and zero subscription/seat_changes writes', async () => {
    const monthlyPlanId = await createK1Plan(1);
    const annualPlanId = await createK1Plan(12);
    const empMonthly = await h.person('E-K1M-1');
    const empAnnual = await h.person('E-K1A-1');
    const today = h.today();

    const subCountBefore = Number(
      (await h.ctx.sql.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM subscriptions`)).rows[0].cnt,
    );
    const seatChangeCountBefore = Number(
      (await h.ctx.sql.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM seat_changes`)).rows[0].cnt,
    );

    const monthlyReq = h.gate.answer({
      status: 'GRANTABLE',
      seat: 'PERSONAL',
      employeeId: empMonthly,
      planId: monthlyPlanId,
      departmentId: h.seed.departmentId,
      expectedEndDate: null,
      termMonths: 3,
      termBound: true,
    });
    const annualReq = h.gate.answer({
      status: 'GRANTABLE',
      seat: 'PERSONAL',
      employeeId: empAnnual,
      planId: annualPlanId,
      departmentId: h.seed.departmentId,
      expectedEndDate: null,
      termMonths: 12,
      termBound: true,
    });

    const monthlyRes = await h.grant({ requestId: monthlyReq }).expect(201);
    const annualRes = await h.grant({ requestId: annualReq }).expect(201);
    const monthlyTask = h.dataOf<{ task: { assignmentId: string; subscriptionId: string | null } }>(monthlyRes).task;
    const annualTask = h.dataOf<{ task: { assignmentId: string; subscriptionId: string | null } }>(annualRes).task;

    expect(monthlyTask.subscriptionId).toBeNull();
    expect(annualTask.subscriptionId).toBeNull();

    const { rows } = await h.ctx.sql.query<{
      id: string;
      subscription_id: string | null;
      personal_commitment_months: number | null;
      billing_anchor_on: string | null;
    }>(
      `SELECT id::text,
              subscription_id::text,
              personal_commitment_months,
              to_char(billing_anchor_on, 'YYYY-MM-DD') AS billing_anchor_on
         FROM license_assignments
        WHERE id = ANY($1::uuid[])`,
      [[monthlyTask.assignmentId, annualTask.assignmentId]],
    );

    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(monthlyTask.assignmentId)).toEqual({
      id: monthlyTask.assignmentId,
      subscription_id: null,
      personal_commitment_months: 1,
      billing_anchor_on: today,
    });
    expect(byId.get(annualTask.assignmentId)).toEqual({
      id: annualTask.assignmentId,
      subscription_id: null,
      personal_commitment_months: 12,
      billing_anchor_on: today,
    });

    const subCountAfter = Number(
      (await h.ctx.sql.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM subscriptions`)).rows[0].cnt,
    );
    const seatChangeCountAfter = Number(
      (await h.ctx.sql.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM seat_changes`)).rows[0].cnt,
    );
    expect(subCountAfter).toBe(subCountBefore);
    expect(seatChangeCountAfter).toBe(seatChangeCountBefore);
  });
});
