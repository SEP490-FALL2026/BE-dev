import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { ItHandoverViewService } from './it-handover-view.service';
import type { ItHandoverRepo } from './it-handover.repo';

describe('ItHandoverViewService', () => {
  const tx = {} as DbTx;
  const source = { kind: 'OFFBOARDING_CASE', id: 'case-1' } as const;

  it('returns PENDING when the leaving IT Admin holds only workspaces and license lots', async () => {
    const items = { findItem: jest.fn().mockResolvedValue(null) } as unknown as ItHandoverRepo;
    const catalog = {
      countResponsibilitiesOf: jest
        .fn()
        .mockResolvedValue(new Map([['leaver', { subscriptions: 0, applications: 0, workspaces: 1, licenseLots: 1 }]])),
    } as unknown as CatalogResponsibilityApi;
    const service = new ItHandoverViewService(items, catalog);

    const view = await service.viewOf(source, 'leaver', tx);

    expect(view).toEqual({ state: 'PENDING', subscriptions: 0, applications: 0, handedOver: null });
  });

  it('returns null when no handover item exists and all responsibility counts are zero', async () => {
    const items = { findItem: jest.fn().mockResolvedValue(null) } as unknown as ItHandoverRepo;
    const catalog = {
      countResponsibilitiesOf: jest
        .fn()
        .mockResolvedValue(new Map([['leaver', { subscriptions: 0, applications: 0, workspaces: 0, licenseLots: 0 }]])),
    } as unknown as CatalogResponsibilityApi;
    const service = new ItHandoverViewService(items, catalog);

    await expect(service.viewOf(source, 'leaver', tx)).resolves.toBeNull();
  });
});
