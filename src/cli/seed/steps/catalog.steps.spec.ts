import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V3 } from '../fixture/shared-demo-v3';
import { subscriptionBody } from './catalog.steps';

/** QĐ-103e, QĐ-103v(4): a subscription the dataset declares names its commitment and the IT Admin who answers for it, or it stays a draft. */
describe('the body of a subscription the dataset declares', () => {
  const employees = new Map(SHARED_DEMO_V3.people.map((person) => [person.code, `id-${person.code}`]));
  const ctx = { fixture: SHARED_DEMO_V3, today: '2026-11-15', ids: { employees } } as unknown as DemoRunContext;
  const subscription = (key: string) => SHARED_DEMO_V3.subscriptions.find((candidate) => candidate.key === key)!;

  it('names the IT Admin in charge of the owner department, and a month for a subscription paid by the month', () => {
    const body = subscriptionBody(ctx, subscription('figma-eng'), 'plan-1', 'department-1');

    expect(body).toMatchObject({
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 1,
      responsibleItAdminEmployeeId: 'id-NV-ITA1',
    });
  });

  it('commits to a year when the subscription is paid by the year', () => {
    const annual = { ...subscription('figma-eng'), billingCycle: 'ANNUAL' as const };

    expect(subscriptionBody(ctx, annual, 'plan-1', 'department-1')).toMatchObject({
      billingCycle: 'ANNUAL',
      commitmentTermMonths: 12,
    });
  });

  it('gives every subscription of the dataset an IT Admin who exists among its people', () => {
    for (const declared of SHARED_DEMO_V3.subscriptions) {
      const body = subscriptionBody(ctx, declared, 'plan-1', 'department-1');

      expect(body.responsibleItAdminEmployeeId).toEqual(expect.stringMatching(/^id-/));
      expect(body.commitmentTermMonths).toBe(declared.billingCycle === 'MONTHLY' ? 1 : 12);
    }
  });
});
