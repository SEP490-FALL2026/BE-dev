import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { SEAT_PURCHASE_STEPS } from './catalog.steps';

const step = SEAT_PURCHASE_STEPS[0];

describe('catalog.seat-purchases step (W3-18 / W3-28)', () => {
  const buildCtx = (changes: unknown[], mode: 'plan' | 'apply' = 'apply') => {
    const writes: Array<{ email: string; method: string; path: string; body: unknown }> = [];
    const call = jest.fn((email: string, method: string, path: string, body?: unknown) => {
      if (method === 'GET' && path === '/subscriptions/sub-canva') {
        return Promise.resolve({ lines: [{ id: 'line-canva' }] });
      }
      if (method === 'GET' && path.startsWith('/subscription-lines/line-canva/seat-changes')) {
        return Promise.resolve({
          items: changes,
          pagination: { page: 1, pageSize: 100, totalItems: changes.length, totalPages: 1 },
        });
      }
      writes.push({ email, method, path, body });
      return Promise.resolve({ id: 'purchase-1', code: 'MUA-000001', quantity: 2 });
    });
    const ids = emptyIds();
    ids.subscriptions.set('canva', 'sub-canva');
    ids.requests.set('R61', 'req-R61');
    for (const p of SHARED_DEMO_V4.people) ids.employees.set(p.code, `emp-${p.code}`);
    const ctx = {
      fixture: SHARED_DEMO_V4,
      today: '2026-11-17',
      mode,
      ids,
      api: { call, signIn: jest.fn().mockResolvedValue(undefined) },
    } as unknown as DemoRunContext;

    return { ctx, writes };
  };

  it('plans the 2-item batch purchase without writing', async () => {
    const { ctx, writes } = buildCtx([], 'plan');

    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'planned' });
    expect(writes).toEqual([]);
  });

  it('posts POST /subscription-lines/{id}/purchases with 2 items as ITO acting IT Admin and caches seatPurchaseId', async () => {
    const { ctx, writes } = buildCtx([], 'apply');

    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'done' });
    expect(writes).toEqual([
      {
        email: 'quan.ly@saoviet.example',
        method: 'POST',
        path: '/subscription-lines/line-canva/purchases',
        body: {
          items: [
            { requestId: 'req-R61', beneficiaryEmployeeId: 'emp-NV-ITO1' },
            { requestId: 'req-R61', beneficiaryEmployeeId: 'emp-NV-ITO2' },
          ],
          purchasedOn: '2026-11-17',
        },
      },
    ]);
    expect(ctx.ids.seatPurchases.get('canva-topup')).toBe('purchase-1');
  });

  it('is idempotent when MUA-… already exists on the line seat-changes', async () => {
    const { ctx, writes } = buildCtx([
      { reason: 'TOP_UP', request: { id: 'req-R61' }, seatPurchase: { id: 'purchase-existing', code: 'MUA-000001' } },
    ]);

    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'present' });
    expect(writes).toEqual([]);
    expect(ctx.ids.seatPurchases.get('canva-topup')).toBe('purchase-existing');
  });
});
