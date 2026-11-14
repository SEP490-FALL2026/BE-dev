import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import {
  CATALOG_STEPS,
  baselineSeatsOf,
  purchasedQuantityOf,
  subscriptionBody,
  workspaceProfileBody,
} from './catalog.steps';

/** QĐ-103d, QĐ-103e: one subscription per plan, in no department's name, bought for the seats of the baseline and the free ones. */
describe('the body of a subscription the dataset declares', () => {
  const employees = new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `id-${person.code}`]));
  const ctx = { fixture: SHARED_DEMO_V4, today: '2026-11-10', ids: { employees } } as unknown as DemoRunContext;
  const subscription = (key: string) => SHARED_DEMO_V4.subscriptions.find((candidate) => candidate.key === key)!;

  it('names the IT Admin who answers for it, no owner department, and a month for a subscription paid by the month', () => {
    const body = subscriptionBody(ctx, subscription('jira'), 'plan-1');

    expect(body).toMatchObject({
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 1,
      responsibleItAdminEmployeeId: 'id-NV-ITA1',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(body).not.toHaveProperty('ownerDepartmentId');
  });

  it('commits to a year that renews on the day the fixture says, counted from today', () => {
    expect(subscriptionBody(ctx, subscription('figma'), 'plan-1')).toMatchObject({
      billingCycle: 'ANNUAL',
      commitmentTermMonths: 12,
      renewalDate: '2026-12-30',
      endDate: '2026-12-29',
      startDate: '2025-12-30',
    });
  });

  it('declares a perpetual subscription with the day it was bought and no end', () => {
    const body = subscriptionBody(ctx, subscription('jetbrains'), 'plan-1');

    expect(body).toMatchObject({ kind: 'PERPETUAL', purchasedQuantity: 3, startDate: '2026-04-24' });
    expect(body).not.toHaveProperty('endDate');
  });

  it('buys the seats of the baseline file and the free ones, or the number the fixture names for a plan with no file', () => {
    for (const declared of SHARED_DEMO_V4.subscriptions) {
      expect(purchasedQuantityOf(ctx, declared)).toBe(
        declared.quantity ?? baselineSeatsOf(ctx, declared.key) + declared.freeAfterBaseline,
      );
    }
    expect(purchasedQuantityOf(ctx, subscription('onepassword'))).toBe(baselineSeatsOf(ctx, 'onepassword'));
  });
});

/** QĐ-110k, R-53 (X-IT-R5): a plan the company administers at the vendor has a profile with two different IT Admins before its subscription is made. */
describe('the workspace profile the dataset records for the plans that need admins at the vendor', () => {
  const employees = new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `id-${person.code}`]));
  const ctx = { fixture: SHARED_DEMO_V4, today: '2026-11-10', ids: { employees } } as unknown as DemoRunContext;
  const plan = (key: string) => SHARED_DEMO_V4.applications.flatMap((app) => app.plans).find((p) => p.key === key)!;

  it('names the IT Admin who answers for the subscription as the owner and another IT Admin as the admin, for every plan that needs them', () => {
    const needing = SHARED_DEMO_V4.applications
      .flatMap((app) => app.plans)
      .filter((p) => p.provisioningType === 'K2' || p.hasAdminConsole === true);
    expect(needing.map((p) => p.key)).toContain('jetbrains-all');
    for (const needed of needing) {
      const body = workspaceProfileBody(ctx, needed)!;
      const responsible = SHARED_DEMO_V4.subscriptions.find((s) => s.plan === needed.key)!.responsible;

      expect(body.primaryOwnerEmployeeId).toBe(`id-${responsible}`);
      expect(body.members).toHaveLength(2);
      expect(new Set(body.members.map((member) => member.employeeId)).size).toBe(2);
      expect(body.members).toContainEqual({ employeeId: `id-${responsible}`, role: 'OWNER' });
      if (needed.vendorAdmin)
        expect(body.members).toContainEqual({ employeeId: `id-${needed.vendorAdmin}`, role: 'ADMIN' });
    }
  });

  it('records the company account at the vendor for every profile but the one left without it to show the flag (QĐ-110u)', () => {
    expect(workspaceProfileBody(ctx, plan('canva-teams'))).not.toHaveProperty('ownerAccountEmail');
    expect(workspaceProfileBody(ctx, plan('jira-standard'))?.ownerAccountEmail).toBe(
      'it-jira-standard@saoviet.example',
    );
  });

  it('asks nothing of a plan that needs no admins at the vendor (K1, K4 with no console, K5)', () => {
    for (const key of ['chatgpt-plus', 'jetbrains-datagrip', 'hr-portal-access']) {
      expect(workspaceProfileBody(ctx, plan(key))).toBeNull();
    }
  });

  it('is a step of its own that the subscriptions wait for', () => {
    const steps = new Map(CATALOG_STEPS.map((step) => [step.key, step]));

    expect(steps.get('catalog.workspace-profiles')?.needs).toEqual(['catalog.plans']);
    expect(steps.get('catalog.subscriptions')?.needs).toContain('catalog.workspace-profiles');
  });
});
