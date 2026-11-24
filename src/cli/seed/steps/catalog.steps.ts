import { addMonths, dayOffset } from '../demo-dates';
import { as, listAll, summarize, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoApplication, DemoPlan, DemoSubscription } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

interface ApplicationRow {
  id: string;
  name: string;
  vendor: { id: string; name: string } | null;
}

/** The IT Admin the dataset writes the catalog as: the one in charge of the IT department. */
export function catalogAdmin(ctx: DemoRunContext): string {
  const it = ctx.fixture.departments.find((department) => department.code === 'ITO');

  return it?.itAdmin ?? ctx.fixture.people.find((person) => person.account === 'IT_ADMIN')?.code ?? '';
}

async function applications(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const application of ctx.fixture.applications) {
    const rows = await listAll<ApplicationRow>(
      ctx,
      admin,
      `/applications?search=${encodeURIComponent(application.name)}`,
    );
    results.push(await oneApplication(ctx, admin, application, rows));
  }

  return summarize(results);
}

async function oneApplication(
  ctx: DemoRunContext,
  admin: string,
  application: DemoApplication,
  rows: ApplicationRow[],
): Promise<Result> {
  const label = application.name;
  const found = rows.find(
    (row) => row.name === application.name && (row.vendor?.name ?? null) === (application.vendorName ?? null),
  );
  if (found) {
    ctx.ids.applications.set(application.key, found.id);
    if (found.vendor) ctx.ids.vendors.set(application.key, found.vendor.id);
    return { status: 'present', label };
  }
  if (ctx.mode === 'plan') return { status: 'planned', label };
  // QĐ-111f: one command makes the application with its first plan (the kind of the application follows the plan, the pricing model follows the
  // kind of provisioning); the other plans of the fixture are made by the next step. The group is one of the seven of the installation (C-O5).
  const [first] = application.plans;
  const groups = await listAll<{ id: string; name: string }>(ctx, admin, '/functional-groups');
  const functionalGroupId = groups.find((group) => group.name === application.functionalGroup)?.id;
  if (!functionalGroupId)
    return { status: 'conflict', label: `${label}: không có nhóm ${application.functionalGroup}` };
  const created = await ctx.api.call<ApplicationRow>(admin, 'POST', '/applications', {
    name: application.name,
    functionalGroupId,
    ...(application.vendorName ? { vendorName: application.vendorName } : {}),
    dataSensitivity: application.dataSensitivity,
    plan: firstPlanBody(first),
  });
  ctx.ids.applications.set(application.key, created.id);
  if (created.vendor) ctx.ids.vendors.set(application.key, created.vendor.id);

  return { status: 'done', label };
}

/** The plan of the one command: the body of a plan without its application, which the command is making. */
function firstPlanBody(plan: DemoPlan): Record<string, unknown> {
  const body = planBody('', plan);
  delete body.applicationId;

  return body;
}

export function planBody(applicationId: string, plan: DemoPlan): Record<string, unknown> {
  return {
    applicationId,
    name: plan.name,
    provisioningType: plan.provisioningType,
    dataLossOnRemoval: plan.dataLossOnRemoval,
    ...(plan.controlLevel ? { controlLevel: plan.controlLevel } : {}),
    ...(plan.revocationNote ? { revocationNote: plan.revocationNote } : {}),
    ...(plan.sharingPolicy ? { sharingPolicy: plan.sharingPolicy } : {}),
    ...(plan.hasAdminConsole !== undefined ? { hasAdminConsole: plan.hasAdminConsole } : {}),
    ...(plan.keyBinding ? { keyBinding: plan.keyBinding } : {}),
    // QĐ-113a: the price before tax in dong of a paid plan, the one a request falls back to when no subscription of the plan has a price.
    ...(plan.referencePrice ? { referencePrice: { amount: plan.referencePrice, currency: 'VND' } } : {}),
  };
}

type PlanRow = { id: string; name: string } & Partial<Record<keyof DemoPlan, unknown>>;

/** The fields of the fixture's plan that the existing one does not have (only those the fixture sets). */
function planDifferences(plan: DemoPlan, row: PlanRow): string[] {
  // The pricing model is not compared: the system works it out from the kind of provisioning (B-5), whatever the fixture still says.
  const keys = [
    'provisioningType',
    'controlLevel',
    'dataLossOnRemoval',
    'sharingPolicy',
    'hasAdminConsole',
    'keyBinding',
  ] as const;

  return keys.filter((key) => plan[key] !== undefined && row[key] !== plan[key]);
}

async function plans(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const application of ctx.fixture.applications) {
    const applicationId = ctx.ids.applications.get(application.key) ?? '';
    const rows = await listAll<PlanRow>(ctx, admin, `/plans?applicationId=${applicationId}`);
    for (const plan of application.plans) {
      const found = rows.find((row) => row.name === plan.name);
      const differences = found ? planDifferences(plan, found) : [];
      if (found) {
        ctx.ids.plans.set(plan.key, found.id);
        results.push(
          differences.length
            ? { status: 'conflict', label: `${plan.name} đã có với ${differences.join(', ')} khác fixture` }
            : { status: 'present', label: plan.name },
        );
      } else if (ctx.mode === 'plan') results.push({ status: 'planned', label: plan.name });
      else {
        const created = await ctx.api.call<{ id: string }>(admin, 'POST', '/plans', planBody(applicationId, plan));
        ctx.ids.plans.set(plan.key, created.id);
        results.push({ status: 'done', label: plan.name });
      }
    }
  }

  return summarize(results);
}

/**
 * Whether the company administers the plan at the vendor, the rule of the API (`QĐ-110k`, R-53): every K2 plan, and a K4 plan with an
 * admin console. Such a plan needs a workspace profile of two IT Admins before its subscription is made.
 */
export function needsVendorAdmins(plan: DemoPlan): boolean {
  return plan.provisioningType === 'K2' || (plan.provisioningType === 'K4' && plan.hasAdminConsole === true);
}

/**
 * The workspace profile of a plan the company administers at the vendor, or null for a plan that has none: the IT Admin who answers for the
 * plan's subscription owns it and another IT Admin (the plan's `vendorAdmin`, or the first other one of the fixture) administers it, so two
 * different ones are recorded before the subscription is made. The email is the company account that owns the workspace at the vendor (never a
 * password); a plan the fixture leaves without one shows the flag `ownerAccountEmailMissing` (`QĐ-110u`).
 */
export function workspaceProfileBody(
  ctx: DemoRunContext,
  plan: DemoPlan,
): {
  primaryOwnerEmployeeId: string;
  members: Array<{ employeeId: string; role: 'OWNER' | 'ADMIN' }>;
  ownerAccountEmail?: string;
} | null {
  if (!needsVendorAdmins(plan)) return null;
  const owner = ctx.fixture.subscriptions.find((subscription) => subscription.plan === plan.key)?.responsible;
  const other =
    plan.vendorAdmin ??
    ctx.fixture.people.find((person) => person.account === 'IT_ADMIN' && person.code !== owner)?.code;
  if (!owner || !other) return null;
  const ownerId = ctx.ids.employees.get(owner) ?? '';
  const adminId = ctx.ids.employees.get(other) ?? '';

  return {
    primaryOwnerEmployeeId: ownerId,
    members: [
      { employeeId: ownerId, role: 'OWNER' },
      { employeeId: adminId, role: 'ADMIN' },
    ],
    ...(plan.withoutOwnerAccountEmail ? {} : { ownerAccountEmail: `it-${plan.key}@${ctx.fixture.emailDomain}` }),
  };
}

async function workspaceProfiles(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const plan of ctx.fixture.applications.flatMap((application) => application.plans)) {
    if (workspaceProfileBody(ctx, plan) === null) continue;
    const label = `${plan.name} (hồ sơ admin ở nhà cung cấp)`;
    const planId = ctx.ids.plans.get(plan.key);
    if (!planId) {
      results.push({ status: 'planned', label });
      continue;
    }
    // A profile an earlier run (or the IT Admin by hand) made is left as it is.
    const detail = await ctx.api.call<{ workspaceProfile: unknown }>(admin, 'GET', `/plans/${planId}`);
    if (detail.workspaceProfile) {
      results.push({ status: 'present', label });
      continue;
    }
    if (ctx.mode === 'plan') {
      results.push({ status: 'planned', label });
      continue;
    }
    await ctx.api.call(admin, 'PUT', `/plans/${planId}/workspace-profile`, workspaceProfileBody(ctx, plan));
    results.push({ status: 'done', label });
  }

  return summarize(results);
}

interface SubscriptionRow {
  id: string;
  status: string;
  updatedAt: string;
}

/** Seats the baseline files put in the subscription, counted from the fixture. */
export function baselineSeatsOf(ctx: DemoRunContext, subscriptionKey: string): number {
  return ctx.fixture.seats.filter((seat) => seat.subscription === subscriptionKey).length;
}

/** What is bought: the baseline seats and the free ones, or the number the fixture names for a plan with no baseline file. */
export function purchasedQuantityOf(ctx: DemoRunContext, subscription: DemoSubscription): number {
  return subscription.quantity ?? baselineSeatsOf(ctx, subscription.key) + subscription.freeAfterBaseline;
}

/** What the dates of a subscription are counted from: the day of the seed. */
type DatedContext = Pick<DemoRunContext, 'today'>;

/** The date fields of a subscription, by the name the API takes. */
type Dates = Record<string, string>;

/** The days of a monthly plan: the calendar year, and a payment day `renewalInDays` from today that stretches the year when it falls in the next one. */
function monthlyDates(ctx: DatedContext, subscription: DemoSubscription): Dates {
  const { year, lastDay } = yearOf(ctx);
  const dates = { startDate: `${year}-01-01`, endDate: lastDay };
  if (subscription.renewalInDays === undefined) return dates;
  const renewalDate = dayOffset(ctx.today, subscription.renewalInDays);

  return {
    ...dates,
    renewalDate,
    ...(renewalDate > `${year + 1}-01-01` ? { endDate: dayOffset(renewalDate, -1) } : {}),
  };
}

/** The days of an annual plan: the 12 months before the renewal day, and the deadline to cancel when the fixture declares one. */
function annualDates(ctx: DatedContext, subscription: DemoSubscription): Dates {
  const { year } = yearOf(ctx);
  if (subscription.renewalInDays === undefined) return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  const renewalDate = dayOffset(ctx.today, subscription.renewalInDays);

  return {
    startDate: addMonths(renewalDate, -12),
    endDate: dayOffset(renewalDate, -1),
    renewalDate,
    ...(subscription.noticeDeadlineInDays === undefined
      ? {}
      : { noticeDeadline: dayOffset(ctx.today, subscription.noticeDeadlineInDays) }),
  };
}

/** The day a subscription starts: the first day the seats of the pool exist, so no seat of it is granted before. */
export function subscriptionStartDate(ctx: DatedContext, subscription: DemoSubscription): string {
  if (subscription.kind === 'PERPETUAL' || subscription.withoutDates) return dayOffset(ctx.today, -200);

  return (subscription.billingCycle === 'ANNUAL' ? annualDates(ctx, subscription) : monthlyDates(ctx, subscription))
    .startDate;
}

/** The terms of a subscription (everything but which plan and for whom), as the API takes them on creation and on update of a draft. */
export function subscriptionTerms(ctx: DemoRunContext, subscription: DemoSubscription): Record<string, unknown> {
  const base = {
    purchasedQuantity: purchasedQuantityOf(ctx, subscription),
    unitPrice: subscription.unitPrice,
    // The quote of the vendor when it is not in dong, kept beside the price (FX-1); the price itself is always in dong.
    ...(subscription.originalPrice ? { originalPrice: subscription.originalPrice } : {}),
    responsibleItAdminEmployeeId: ctx.ids.employees.get(subscription.responsible),
  };
  // A key is bought once, on a day in the past (the purchase date is the start date); it has no term and no end.
  if (subscription.kind === 'PERPETUAL') return { ...base, startDate: dayOffset(ctx.today, -200) };
  const cycle = { billingCycle: subscription.billingCycle, commitmentTermMonths: subscription.termMonths };
  // A plan with no date to alert from: no end, no renewal, no notice (the warning `NO_ALERT_ANCHOR`, the refusal `CONTRACT_DATA_INCOMPLETE`).
  if (subscription.withoutDates) {
    return {
      ...base,
      ...cycle,
      startDate: dayOffset(ctx.today, -200),
      autoRenew: false,
      allowsMidTermReduction: false,
    };
  }
  const dates =
    subscription.billingCycle === 'ANNUAL' ? annualDates(ctx, subscription) : monthlyDates(ctx, subscription);

  return {
    ...base,
    ...cycle,
    ...dates,
    noticePeriodDays: subscription.noticePeriodDays ?? 30,
    autoRenew: subscription.autoRenew ?? true,
    allowsMidTermReduction: false,
  };
}

export function subscriptionBody(
  ctx: DemoRunContext,
  subscription: DemoSubscription,
  planId: string,
): Record<string, unknown> {
  return {
    planId,
    kind: subscription.kind,
    ...subscriptionTerms(ctx, subscription),
  };
}

async function subscriptions(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const subscription of ctx.fixture.subscriptions) {
    results.push(await oneSubscription(ctx, admin, subscription));
  }

  return summarize(results);
}

/**
 * One subscription for a (application, plan): found by its plan, whatever its period and quantity became since (the demo changes them),
 * so a rerun never makes a second one (the stock of the pool is one, `QĐ-103d`).
 */
async function oneSubscription(ctx: DemoRunContext, admin: string, subscription: DemoSubscription): Promise<Result> {
  const label = subscription.key;
  const planId = ctx.ids.plans.get(subscription.plan) ?? '';
  const rows = await listAll<SubscriptionRow>(ctx, admin, `/subscriptions?planId=${planId}`);
  let found = rows[0];
  if (!found && ctx.mode === 'plan') return { status: 'planned', label };
  if (!found)
    found = await ctx.api.call<SubscriptionRow>(
      admin,
      'POST',
      '/subscriptions',
      subscriptionBody(ctx, subscription, planId),
    );
  ctx.ids.subscriptions.set(subscription.key, found.id);
  const created = rows.length === 0;
  if (found.status === 'ACTIVE') return { status: created ? 'done' : 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label: `${label} (hoàn tất bản nháp)` };
  // A draft an earlier run left is brought to the fixture's terms before it is completed.
  await ctx.api.call(admin, 'PATCH', `/subscriptions/${found.id}`, {
    ...subscriptionTerms(ctx, subscription),
    expectedUpdatedAt: found.updatedAt,
  });
  await ctx.api.call(admin, 'POST', `/subscriptions/${found.id}/completions`);

  return { status: 'done', label };
}

export const CATALOG_STEPS: readonly DemoStep[] = [
  { key: 'catalog.applications', title: 'Ứng dụng (IT Admin)', needs: ['org.accounts'], run: applications },
  { key: 'catalog.plans', title: 'Gói (IT Admin)', needs: ['catalog.applications'], run: plans },
  {
    key: 'catalog.workspace-profiles',
    title: 'Hồ sơ admin ở nhà cung cấp của gói K2 và K4 có trang quản trị: hai IT Admin (IT Admin)',
    needs: ['catalog.plans'],
    run: workspaceProfiles,
  },
  {
    key: 'catalog.subscriptions',
    title: 'Một thuê bao cho mỗi gói: kho dùng chung (IT Admin)',
    needs: ['catalog.plans', 'catalog.workspace-profiles'],
    run: subscriptions,
  },
];
