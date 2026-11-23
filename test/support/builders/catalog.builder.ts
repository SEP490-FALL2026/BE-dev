import {
  ApplicationService,
  type DeclareApplicationInput,
} from '../../../src/modules/catalog/catalog-entry/application.service';
import { DeclarePlanBodyDto } from '../../../src/modules/catalog/plan/plan.dto';
import { PlanService } from '../../../src/modules/catalog/plan/plan.service';
import { DeclareSubscriptionBodyDto } from '../../../src/modules/catalog/subscription/subscription.dto';
import { SubscriptionService } from '../../../src/modules/catalog/subscription/subscription.service';
import { pricingOfBody, writeLegacyPricing } from '../legacy-pricing';
import type { HttpTestApp } from '../http-test-app';
import { principalOf, sent } from './account.builder';

/*
 * T2.2: the catalog a suite only needs as a precondition (an application, its plan, a subscription of it), declared by the
 * service each route calls, as the IT Admin whose token the route would have carried and on the body its validation pipe
 * would have passed on (see organization.builder.ts). A suite that proves one of these routes calls the route itself. No
 * assertion lives here.
 */

/**
 * The IT Admin declares an application and gets its id. The application alone, with no plan (the plan is `declarePlan`): the one command of the
 * route (`POST /applications`, application and first plan) is proved by its own suite. A suite states the kind it needs (a LICENSED
 * application, which the route no longer makes) and, for an older suite, the answers about communication, which nothing reads any more.
 */
export async function declareApplication(ctx: HttpTestApp, itAdminToken: string, body: object): Promise<string> {
  const actor = await principalOf(ctx, itAdminToken);
  const input = sent(body) as DeclareApplicationInput & { communication?: unknown };
  delete input.communication;
  const { application } = await ctx.app.get(ApplicationService, { strict: false }).declare(actor, input);

  return application.id;
}

/**
 * A plan that needs admins at the vendor (a K2 plan, or a K4 plan with an admin console) is not activated without a profile of two different people
 * (X-IT.5, `QĐ-110k`): a suite that only needs such a plan as a precondition gets the profile by the row, the declaring IT Admin as the owner and
 * another employee as the admin, as the seed of the demo does. Nothing happens for a plan that needs none, or that already has a profile. A suite
 * that proves the rule or the profile calls the routes itself and removes it. No assertion lives here.
 */
export async function ensureVendorAdmins(ctx: HttpTestApp, planId: string, ownerEmployeeId: string): Promise<void> {
  const plan = await ctx.sql.query<{ needs: boolean }>(
    `SELECT (provisioning_type = 'K2' OR (provisioning_type = 'K4' AND has_admin_console)) AS needs FROM plans WHERE id = $1`,
    [planId],
  );
  if (!plan.rows[0]?.needs) return;
  // The second admin is an IT Admin who can act when the installation has one: once the baseline is closed a plan needs two who work (`QĐ-114ae`),
  // and a suite that closes it makes the second account before the plan. Otherwise the first employee by code, as before.
  const other = await ctx.sql.query<{ id: string }>(
    `SELECT e.id FROM employees e
      WHERE e.id <> $1
      ORDER BY EXISTS (
                 SELECT 1 FROM app_users u JOIN role_grants g ON g.app_user_id = u.id
                  WHERE u.employee_id = e.id AND u.status = 'ACTIVE' AND u.activation_state = 'ACTIVATED'
                    AND e.status = 'ACTIVE' AND g.role = 'IT_ADMIN' AND g.revoked_at IS NULL
               ) DESC,
               e.employee_code
      LIMIT 1`,
    [ownerEmployeeId],
  );
  const profile = await ctx.sql.query(
    `INSERT INTO plan_workspace_profiles (plan_id, primary_owner_employee_id) VALUES ($1, $2) ON CONFLICT (plan_id) DO NOTHING`,
    [planId, ownerEmployeeId],
  );
  if (profile.rowCount === 0) return;
  await ctx.sql.query(
    `INSERT INTO plan_workspace_admins (plan_id, employee_id, role) VALUES ($1, $2, 'OWNER'::"WorkspaceRole"), ($1, $3, 'ADMIN'::"WorkspaceRole")`,
    [planId, ownerEmployeeId, other.rows[0].id],
  );
}

/** The IT Admin declares a plan of an application (`POST /plans`) and gets its id. */
export async function declarePlan(ctx: HttpTestApp, itAdminToken: string, body: object): Promise<string> {
  const actor = await principalOf(ctx, itAdminToken);
  // The pricing model follows the kind of provisioning (B-5): a suite that wants another one gets the row as older releases made it.
  const { pricingModel, ...rest } = sent(body) as { provisioningType: string; pricingModel?: string };
  const { id } = await ctx.app
    .get(PlanService, { strict: false })
    .declare(actor, DeclarePlanBodyDto.create({ ...rest, ...pricingOfBody(rest.provisioningType, pricingModel) }));
  await writeLegacyPricing(ctx.sql, id, rest.provisioningType, pricingModel);
  await ensureVendorAdmins(ctx, id, actor.employeeId);

  return id;
}

/** The IT Admin declares a subscription of a plan (`POST /subscriptions`) and gets its id. */
export async function declareSubscription(ctx: HttpTestApp, itAdminToken: string, body: object): Promise<string> {
  const actor = await principalOf(ctx, itAdminToken);
  const { planId } = body as { planId?: string };
  if (planId) await ensureVendorAdmins(ctx, planId, actor.employeeId);
  const { kind, billingCycle } = body as { kind?: string; billingCycle?: string };
  // A subscription that becomes active names the months it commits to and the IT Admin who answers for it (QĐ-103e, QĐ-103v(4)):
  // the commitment follows the cycle the body names, and the IT Admin who declares it answers unless the body says otherwise.
  const commitment =
    kind === 'PERPETUAL' || billingCycle === undefined
      ? {}
      : { commitmentTermMonths: billingCycle === 'MONTHLY' ? 1 : 12 };

  return (
    await ctx.app
      .get(SubscriptionService, { strict: false })
      .declare(
        actor,
        DeclareSubscriptionBodyDto.create(
          sent({ responsibleItAdminEmployeeId: actor.employeeId, ...commitment, ...body }),
        ),
      )
  ).id;
}
