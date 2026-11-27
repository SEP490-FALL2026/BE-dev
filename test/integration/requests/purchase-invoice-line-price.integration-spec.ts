import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';
import { takeOwnerOff } from '../../support/shared-pool-subscription';

const h = new InvoiceHarness();
const M = 1_000_000;

interface Preview {
  matchResult: string;
  flags: string[];
}

/**
 * The ceiling an invoice of the shared pool may reach before it is marked over is the seats times the price of the line that serves the plan,
 * never the price columns of a period that has lines (they are only a record: a line is edited through the line). The period here keeps the
 * harness price on its columns (1.000.000) and its only line is priced 500.000.
 */
describe('over-approved ceiling of a pool invoice follows the price of the line (integration, real PostgreSQL; W3 audit B-1)', () => {
  let pool: string;
  let twoPlans: string;
  let premiumLineId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    pool = await takeOwnerOff(h, await h.subscription(10, 'K2'));
    await h.ctx.sql.query(
      `UPDATE subscription_lines SET monthly_unit_price_minor = 500000 WHERE subscription_id = $1`,
      [pool],
    );
    await h.ctx.sql.query(
      `UPDATE subscriptions SET renewal_date = $2, original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [pool, `${h.year}-12-05`],
    );
    // A second pool with two plans, each its own line and its own seats: Standard 10 x 500.000 and Premium 5 x 800.000.
    twoPlans = await takeOwnerOff(h, await h.subscription(10, 'K2'));
    await h.ctx.sql.query(
      `UPDATE subscription_lines SET monthly_unit_price_minor = 500000 WHERE subscription_id = $1`,
      [twoPlans],
    );
    await h.ctx.sql.query(
      `UPDATE subscriptions SET renewal_date = $2, original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [twoPlans, `${h.year}-12-05`],
    );
    const standardPlanId = await h.planOf(twoPlans);
    const premiumPlanId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding)
         SELECT gen_random_uuid(), organization_id, application_id, 'Premium ceiling', 'premium ceiling', provisioning_type,
                pricing_model, control_level, key_binding
           FROM plans WHERE id = $1
         RETURNING id`,
        [standardPlanId],
      )
    ).rows[0].id;
    premiumLineId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO subscription_lines (id, organization_id, subscription_id, workspace_id, plan_id, monthly_unit_price_minor,
           ledger_opened_on, updated_at)
         SELECT gen_random_uuid(), organization_id, id, workspace_id, $2, 800000, '2026-01-05', now() FROM subscriptions WHERE id = $1
         RETURNING id`,
        [twoPlans, premiumPlanId],
      )
    ).rows[0].id;
    await h.ctx.sql.query(
      `INSERT INTO seat_changes (id, organization_id, subscription_line_id, effective_on, delta, reason, source, basis)
       VALUES (gen_random_uuid(), $1, $2, '2026-01-05', 5, 'INITIAL', 'ADJUSTMENT', 'NONE')`,
      [h.seed.organizationId, premiumLineId],
    );
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const flagsOf = async (link: object, net: string, quantity: number, account: ApiAccount = h.it1): Promise<Preview> =>
    h.dataOf<Preview>(
      await request(h.server())
        .post('/api/v1/purchase-invoices/preview')
        .set(h.as(account))
        .send({
          link,
          vendorInvoiceNumber: `PL-${(counter += 1)}`,
          issuedOn: `${h.year}-11-02`,
          servicePeriodMonth: `${h.year}-09`,
          quantity,
          unitPriceOriginal: { amount: '15', currency: 'USD' },
          netAmount: { amount: net },
          paymentSource: 'COMPANY_CARD',
        })
        .expect(200),
    );

  it('marks the invoice of the pool by the line: ten seats x 500.000 x three months to the renewal day is 15.000.000', async () => {
    expect(await flagsOf({ subscriptionId: pool }, '15000001', 10)).toMatchObject({ flags: ['OVER_APPROVED'] });
    expect(await flagsOf({ subscriptionId: pool }, '15000000', 10)).toMatchObject({ flags: [] });
  });

  it('marks the invoice of a K2 request by the line of its plan: one seat x 500.000 x three months is 1.500.000', async () => {
    const unit = await h.departmentWithHead('P-PLP1');
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.budgetFor(unit, { total: 100 * M });
    const requestId = await h.waitingForApprover(unit, await h.planOf(pool), { amount: 3 * M });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const assignmentId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, granted_on, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL'::"AssignmentKind", 'REQUEST'::"AssignmentSource", $3, $4, $5,
         $6, $6, $7::date, 'ACTUAL'::"AssignmentDateBasis", $7::date, $8)`,
      [
        assignmentId,
        h.seed.organizationId,
        await h.planOf(pool),
        pool,
        unit.member.employeeId,
        'pl-k2@acme.vn',
        `${h.year}-09-01`,
        h.it1.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id,
         max_attempts, purchase_kind, purchased_at, claimed_by_app_user_id, claimed_at,
         completed_by_app_user_id, completed_at, evidence, created_by_system)
       VALUES ($1, $2, $3, 'GRANT'::"ProvisioningTaskKind", 'MANUAL'::"ProvisioningChannel",
         'COMPLETED'::"ProvisioningTaskStatus", $4, 3, 'POOL_TOP_UP'::"ProvisioningPurchaseKind",
         $5::timestamptz, $6, $5::timestamptz, $6, $5::timestamptz, 'Granted K2 top-up', true)`,
      [randomUUID(), h.seed.organizationId, assignmentId, requestId, `${h.year}-09-01T02:00:00.000Z`, h.it1.appUserId],
    );

    expect(await flagsOf({ requestId }, '1500001', 1)).toMatchObject({ flags: ['OVER_APPROVED'] });
    expect(await flagsOf({ requestId }, '1500000', 1)).toMatchObject({ flags: [] });
  });

  it('marks the invoice of the whole period with two plans by the sum of its lines: (10 x 500.000 + 5 x 800.000) x three months is 27.000.000', async () => {
    expect(await flagsOf({ subscriptionId: twoPlans }, '27000001', 15)).toMatchObject({ flags: ['OVER_APPROVED'] });
    expect(await flagsOf({ subscriptionId: twoPlans }, '27000000', 15)).toMatchObject({ flags: [] });
  });

  it('marks the invoice of the selected line by that line: five Premium seats x 800.000 x three months is 12.000.000', async () => {
    const link = { subscriptionId: twoPlans, subscriptionLineIds: [premiumLineId] };

    expect(await flagsOf(link, '12000001', 5)).toMatchObject({ flags: ['OVER_APPROVED'] });
    expect(await flagsOf(link, '12000000', 5)).toMatchObject({ flags: [] });
  });

  it('marks the invoice of a seat purchase of the Premium line by the price of that line: two seats x 800.000 x three months is 4.800.000', async () => {
    const purchaseId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO seat_purchases (id, organization_id, subscription_line_id, code, kind, purchased_on, quantity, invoice_obligation,
           invoice_due_on, recorded_by_employee_id)
         VALUES (gen_random_uuid(), $1, $2, 'MUA-000901', 'TOP_UP', $3::date, 2, 'WORKING_DAYS', $3::date + 9, $4)
         RETURNING id`,
        [h.seed.organizationId, premiumLineId, `${h.year}-09-01`, h.it1.employeeId],
      )
    ).rows[0].id;
    const link = { subscriptionId: twoPlans, seatPurchaseId: purchaseId };

    expect(await flagsOf(link, '4800001', 2)).toMatchObject({ flags: ['OVER_APPROVED'] });
    expect(await flagsOf(link, '4800000', 2)).toMatchObject({ flags: [] });
  });
});
