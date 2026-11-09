import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { baselineSeatsOf, purchasedQuantityOf, subscriptionBody } from './catalog.steps';

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
