import { runDemoSteps } from './seed-runner';
import type { DemoRunContext } from './demo-run.types';
import { DemoInventoryIncompleteError, listAll, MAX_PAGES } from './demo-step-kit';

/** A context whose API answers one list of `total` items, `pageSize` a page. */
function listing(total: number) {
  const calls: string[] = [];
  const call = (_email: string, _method: string, path: string) => {
    calls.push(path);
    const page = Number(/page=(\d+)/.exec(path)?.[1]);
    const totalPages = Math.max(1, Math.ceil(total / 100));
    const start = (page - 1) * 100;
    const items = Array.from({ length: Math.max(0, Math.min(100, total - start)) }, (_, i) => ({ n: start + i }));

    return Promise.resolve({ items, pagination: { page, pageSize: 100, totalItems: total, totalPages } });
  };

  return { ctx: { mode: 'plan', api: { call } } as unknown as DemoRunContext, calls };
}

describe('listing what already exists', () => {
  it('reads every page of a list', async () => {
    const { ctx, calls } = listing(250);

    const items = await listAll<{ n: number }>(ctx, 'a@x.example', '/things?kind=A');

    expect(items).toHaveLength(250);
    expect(calls).toEqual([
      '/things?kind=A&page=1&pageSize=100',
      '/things?kind=A&page=2&pageSize=100',
      '/things?kind=A&page=3&pageSize=100',
    ]);
  });

  it('refuses rather than answer a partial list when the list is longer than it reads', async () => {
    const { ctx, calls } = listing(MAX_PAGES * 100 + 1);

    await expect(listAll(ctx, 'a@x.example', '/things')).rejects.toBeInstanceOf(DemoInventoryIncompleteError);
    expect(calls).toHaveLength(MAX_PAGES);
  });

  it('reports a step that met an incomplete list as a conflict, never as absent', async () => {
    const { ctx } = listing(MAX_PAGES * 100 + 1);

    const [report] = await runDemoSteps(ctx, [
      {
        key: 'a',
        title: 'a',
        needs: [],
        run: () => listAll(ctx, 'a@x.example', '/things').then(() => ({ status: 'done' })),
      },
    ]);

    expect(report.status).toBe('conflict');
    expect(report.detail).toMatch(/longer than the 50 pages/);
  });
});
