import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { CATALOG_EXTRA_STEPS } from './catalog-extra.steps';
import { subscriptionHasPlan } from './catalog.steps';

describe('the retired Skype application', () => {
  it('has neither a subscription nor a seat', () => {
    expect(fixture.retiredApplications).toEqual(['skype']);
    for (const key of fixture.retiredApplications) {
      const plans = fixture.applications.find((row) => row.key === key)!.plans.map((row) => row.key);
      const subscriptions = fixture.subscriptions.filter((row) => plans.some((p) => subscriptionHasPlan(row, p)));
      expect(subscriptions).toHaveLength(0);
      expect(
        fixture.seats.filter((row) => subscriptions.some((subscription) => subscription.key === row.subscription)),
      ).toHaveLength(0);
    }
  });
  it.each([
    ['RETIRED', false, 'present', 0],
    ['APPROVED', true, 'done', 1],
    ['APPROVED', false, 'conflict', 0],
  ])('reads %s and retires only when allowed', async (status, canRetire, expected, writes) => {
    const step = CATALOG_EXTRA_STEPS.find(({ key }) => key === 'catalog.retirement')!;
    const ids = emptyIds();
    ids.applications.set('skype', 'skype-id');
    const call = jest.fn((_email: string, method: string) =>
      Promise.resolve(
        method === 'GET'
          ? { retirement: { status, canRetire, retiredAt: status === 'RETIRED' ? '2026-11-18T00:00:00Z' : null } }
          : { id: 'skype-id', status: 'RETIRED' },
      ),
    );
    const ctx = { fixture, ids, mode: 'apply', api: { call, signIn: jest.fn() } } as unknown as DemoRunContext;
    expect(step.needs).toContain('catalog.plans');
    await expect(step.run(ctx)).resolves.toMatchObject({ status: expected });
    expect(call.mock.calls.filter((args) => args[1] === 'POST')).toHaveLength(writes);
  });
});
