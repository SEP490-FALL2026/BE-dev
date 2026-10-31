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

/** The IT Admin declares a plan of an application (`POST /plans`) and gets its id. */
export async function declarePlan(ctx: HttpTestApp, itAdminToken: string, body: object): Promise<string> {
  const actor = await principalOf(ctx, itAdminToken);

  return (await ctx.app.get(PlanService, { strict: false }).declare(actor, DeclarePlanBodyDto.create(sent(body)))).id;
}

/** The IT Admin declares a subscription of a plan (`POST /subscriptions`) and gets its id. */
export async function declareSubscription(ctx: HttpTestApp, itAdminToken: string, body: object): Promise<string> {
  const actor = await principalOf(ctx, itAdminToken);

  return (
    await ctx.app
      .get(SubscriptionService, { strict: false })
      .declare(actor, DeclareSubscriptionBodyDto.create(sent(body)))
  ).id;
}
