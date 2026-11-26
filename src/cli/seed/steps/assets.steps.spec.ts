import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { ASSET_STEPS } from './assets.steps';

const step = ASSET_STEPS[0];

function context(stored: Record<string, number>) {
  const ids = emptyIds();
  for (const lot of fixture.lots) ids.lots.set(lot.key, `lot-${lot.key}`);
  const calls: { method: string; path: string; body: unknown }[] = [];
  const call = jest.fn((_email: string, method: string, path: string, body?: unknown) => {
    if (method === 'GET') {
      const key = path.split('licenseLotId=lot-')[1].split('&')[0];
      const items = Array.from({ length: stored[key] ?? 0 }, (_, index) => ({ id: `key-${index}` }));

      return Promise.resolve({ items, pagination: { totalPages: 1 } });
    }
    calls.push({ method, path, body });

    return Promise.resolve({});
  });
  const api = { call, signIn: jest.fn().mockResolvedValue(undefined) };

  return { ctx: { fixture, ids, mode: 'apply', demoPassword: 'x', api } as unknown as DemoRunContext, calls };
}

describe('the key stores of the lots of K4 licenses (W2-25, W3-24)', () => {
  it('imports the Office key with its cap of 30 activations and the 8 it already had, and the keys of the plans bound to an account with neither', async () => {
    const { ctx, calls } = context({});

    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'done' });

    const body = (lot: string) =>
      calls.find((entry) => entry.path === `/license-lots/lot-${lot}/keys`)!.body as Record<string, unknown>;
    expect(body('office-home-business-2024')).toMatchObject({ maxActivations: 30, initialActivationsUsed: 8 });
    expect((body('office-home-business-2024').keys as string[]).length).toBe(1);
    expect(body('jetbrains')).not.toHaveProperty('maxActivations');
    expect(body('jetbrains')).not.toHaveProperty('initialActivationsUsed');
    expect(calls.every((entry) => entry.method === 'POST' && !('subscriptionId' in (entry.body as object)))).toBe(true);
  });

  it('waits for the lots, and imports a key into a lot that is not there as a conflict, writing nothing', async () => {
    expect(step.needs).toEqual(['catalog.lots']);
    const { ctx, calls } = context({});
    ctx.ids.lots.delete('visio-pro');

    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'conflict' });

    expect(calls.some((entry) => entry.path.includes('lot-visio-pro'))).toBe(false);
  });

  it('leaves a store that already has keys as it is', async () => {
    const { ctx, calls } = context({
      'office-home-business-2024': 1,
      jetbrains: 3,
      'visio-pro': 3,
      'sublime-license': 2,
    });

    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'present' });

    expect(calls).toEqual([]);
  });
});
