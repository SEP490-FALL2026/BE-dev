import { DeclareApplicationBodyDto } from '../../../src/modules/catalog/catalog-entry/application.dto';
import { ApplicationService } from '../../../src/modules/catalog/catalog-entry/application.service';
import { DeclarePlanBodyDto } from '../../../src/modules/catalog/plan/plan.dto';
import { PlanService } from '../../../src/modules/catalog/plan/plan.service';
import { DeclareSubscriptionBodyDto } from '../../../src/modules/catalog/subscription/subscription.dto';
import { SubscriptionService } from '../../../src/modules/catalog/subscription/subscription.service';
import type { HttpTestApp } from '../http-test-app';
import { principalOf, sent } from './account.builder';

/*
 * T2.2: the catalog a suite only needs as a precondition (an application, its plan, a subscription of it), declared by the
 * service each route calls, as the IT Admin whose token the route would have carried and on the body its validation pipe
 * would have passed on (see organization.builder.ts). A suite that proves one of these routes calls the route itself. No
 * assertion lives here.
 */

/** The IT Admin declares an application (`POST /applications`) and gets its id. */
export async function declareApplication(ctx: HttpTestApp, itAdminToken: string, body: object): Promise<string> {
  const actor = await principalOf(ctx, itAdminToken);
  const { application } = await ctx.app
    .get(ApplicationService, { strict: false })
    .declare(actor, DeclareApplicationBodyDto.create(sent(body)));

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
  const other = await ctx.sql.query<{ id: string }>(
    `SELECT id FROM employees WHERE id <> $1 ORDER BY employee_code LIMIT 1`,
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
  const { id } = await ctx.app
    .get(PlanService, { strict: false })
    .declare(actor, DeclarePlanBodyDto.create(sent(body)));
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
