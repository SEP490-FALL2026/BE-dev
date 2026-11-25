import { randomUUID } from 'node:crypto';
import type { HttpTestApp } from '../http-test-app';

/*
 * The subscriptions the routes refuse since W3-27 (a purchase made once, and anything of a plan of personal accounts) are still the precondition of the suites of
 * wave 2: a purchase of license keys is a perpetual subscription, and the pools of K1 were subscriptions. Declaring them by the service is refused, so a suite that only
 * needs one as a precondition gets the row, as the migrations leave the data that exists: a perpetual purchase is a lot of the same id (the test databases carry the bridge of
 * `legacy-perpetual-lot-bridge.ts`), and a K1 subscription stays a row. A suite that proves the refusal calls the route itself. No assertion lives here.
 */

interface LegacyBody {
  planId: string;
  kind: 'TERM' | 'PERPETUAL';
  purchasedQuantity?: number;
  unitPrice?: { amount: string; currency: string };
  monthlyUnitPrice?: { amount: string; currency: string };
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  commitmentTermMonths?: number;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  responsibleItAdminEmployeeId?: string;
}

/** Whether the service would refuse this declaration since W3-27: a purchase made once, or a plan of personal accounts. */
export async function isRetiredDeclaration(ctx: HttpTestApp, body: object): Promise<boolean> {
  const { planId, kind } = body as { planId?: string; kind?: string };
  if (kind === 'PERPETUAL') return true;
  if (!planId) return false;
  const plan = await ctx.sql.query<{ provisioning_type: string }>(
    `SELECT provisioning_type::text FROM plans WHERE id = $1`,
    [planId],
  );

  return plan.rows[0]?.provisioning_type === 'K1';
}

/** Writes the subscription as the declaration would have: complete (active, with its price) when it names a price, a start and its cycle, a draft otherwise. */
export async function insertLegacySubscription(
  ctx: HttpTestApp,
  body: object,
  responsibleEmployeeId: string,
): Promise<string> {
  const input = body as LegacyBody;
  const plan = await ctx.sql.query<{ organization_id: string }>(`SELECT organization_id FROM plans WHERE id = $1`, [
    input.planId,
  ]);
  const organizationId = plan.rows[0].organization_id;
  const id = randomUUID();
  const perpetual = input.kind === 'PERPETUAL';
  const cycle = perpetual ? null : (input.billingCycle ?? null);
  const months = cycle === 'ANNUAL' ? 12 : 1;
  const unit = input.unitPrice ? BigInt(input.unitPrice.amount) : null;
  const monthly = input.monthlyUnitPrice
    ? BigInt(input.monthlyUnitPrice.amount)
    : unit !== null && !perpetual
      ? unit / BigInt(months)
      : null;
  const complete = unit !== null && input.startDate !== undefined && (perpetual || cycle !== null);
  if (!complete) {
    await ctx.sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, responsible_it_admin_employee_id, updated_at)
       VALUES ($1, $2, $3, $4::"SubscriptionKind", 'DRAFT'::"SubscriptionStatus", $5, $6, now())`,
      [
        id,
        organizationId,
        input.planId,
        input.kind,
        input.purchasedQuantity ?? null,
        input.responsibleItAdminEmployeeId ?? responsibleEmployeeId,
      ],
    );

    return id;
  }
  await ctx.sql.query(
    `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, billing_cycle, commitment_term_months,
       start_date, end_date, renewal_date, responsible_it_admin_employee_id, unit_price_minor, unit_price_currency, price_recorded_on, price_rate,
       price_rate_date, price_rate_source, price_reporting_minor, price_reporting_currency, monthly_unit_price_minor, updated_at)
     VALUES ($1, $2, $3, $4::"SubscriptionKind", 'ACTIVE'::"SubscriptionStatus", $5, $6::"BillingCycle", $7, $8, $9, $10, $11, $12, 'VND', $8, 1.0, $8,
       'SAME_CURRENCY'::"PriceRateSource", $12, 'VND', $13, now())`,
    [
      id,
      organizationId,
      input.planId,
      input.kind,
      input.purchasedQuantity ?? null,
      cycle,
      perpetual ? null : (input.commitmentTermMonths ?? (cycle === 'ANNUAL' ? 12 : 1)),
      input.startDate,
      input.endDate ?? null,
      input.renewalDate ?? null,
      input.responsibleItAdminEmployeeId ?? responsibleEmployeeId,
      unit,
      monthly,
    ],
  );

  return id;
}
