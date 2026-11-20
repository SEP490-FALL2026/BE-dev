import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { FINANCE_STEPS } from './finance.steps';

describe('the tax profiles of six vendors (T9, S09)', () => {
  const profiles = SHARED_DEMO_V4.taxProfiles;
  const application = (key: string) => SHARED_DEMO_V4.applications.find((candidate) => candidate.key === key)!;

  it('declares six profiles, the groups T2 and T3 both among them, for six different vendors', () => {
    expect(profiles).toHaveLength(6);
    expect(new Set(profiles.map((profile) => profile.group))).toEqual(new Set(['T2', 'T3']));
    expect(profiles.filter((profile) => profile.group === 'T3').map((profile) => profile.application)).toEqual([
      'zoom',
    ]);
    const vendors = profiles.map((profile) => application(profile.application).vendorName);
    expect(vendors.every((vendor) => typeof vendor === 'string' && vendor.length > 0)).toBe(true);
    expect(new Set(vendors)).toEqual(new Set(['Figma', 'Microsoft', 'Adobe', 'Notion Labs', 'Atlassian', 'Zoom']));
  });

  it('keeps the profile of Figma it always had and names an application with a vendor for every other one', () => {
    expect(profiles[0]).toMatchObject({
      application: 'figma',
      group: 'T2',
      lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }],
    });
    for (const profile of profiles) expect(profile.lines.length).toBeGreaterThan(0);
  });

  describe('finance.tax-profile', () => {
    const step = FINANCE_STEPS.find((candidate) => candidate.key === 'finance.tax-profile')!;
    const vendors = new Map(profiles.map((profile) => [profile.application, `vendor-${profile.application}`]));
    const run = (
      answer: (vendorId: string) => { status: string; profile: { group: string } | null },
      mode: 'apply' | 'plan' = 'apply',
    ) => {
      const call = jest.fn((...[, method, path]: [string, string, string, unknown?]): Promise<unknown> => {
        const vendorId = path.split('/')[2];

        return Promise.resolve(method === 'GET' ? answer(vendorId) : {});
      });
      const ctx = {
        fixture: SHARED_DEMO_V4,
        mode,
        api: { call, signIn: () => Promise.resolve() },
        ids: { vendors },
        demoPassword: 'x',
      } as unknown as DemoRunContext;

      return { outcome: step.run(ctx), call };
    };
    const writes = (call: jest.Mock<Promise<unknown>, [string, string, string, unknown?]>) =>
      call.mock.calls.filter((args) => args[1] === 'PUT');

    it('declares the six that have none, each with its own group and lines', async () => {
      const { outcome, call } = run(() => ({ status: 'NOT_DECLARED', profile: null }));

      await expect(outcome).resolves.toMatchObject({ status: 'done' });
      expect(writes(call)).toHaveLength(6);
      const bodies = writes(call).map((args) => args[3] as { group: string });
      expect(bodies.filter((body) => body.group === 'T3')).toHaveLength(1);
    });

    it('leaves a vendor already declared with the same group, and reports one declared with another group', async () => {
      const same = run((vendorId) => ({
        status: 'DECLARED',
        profile: { group: vendorId === 'vendor-zoom' ? 'T3' : 'T2' },
      }));
      await expect(same.outcome).resolves.toMatchObject({ status: 'present' });
      expect(writes(same.call)).toHaveLength(0);

      const other = run((vendorId) => ({
        status: 'DECLARED',
        profile: { group: vendorId === 'vendor-zoom' ? 'T2' : 'T2' },
      }));
      await expect(other.outcome).resolves.toMatchObject({ status: 'conflict' });
      expect(writes(other.call)).toHaveLength(0);
    });

    it('writes nothing in plan mode', async () => {
      const { outcome, call } = run(() => ({ status: 'NOT_DECLARED', profile: null }), 'plan');

      await expect(outcome).resolves.toMatchObject({ status: 'planned' });
      expect(writes(call)).toHaveLength(0);
    });
  });
});
