import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PersonnelFileHookContributions, PersonnelFileEvent } from '../public/personnel.extension-points';
import { ItHandoverRecorder } from './it-handover-recorder.listener';
import type { ItHandoverRepo } from './it-handover.repo';

describe('ItHandoverRecorder', () => {
  it('records a handover item when the employee holds only workspaces and license lots', async () => {
    let handler: ((tx: DbTx, event: PersonnelFileEvent) => Promise<void>) | undefined;
    const hooks = {
      add: (_key: string, hook: { onRecorded: (tx: DbTx, event: PersonnelFileEvent) => Promise<void> }) => {
        handler = hook.onRecorded;
      },
    } as unknown as PersonnelFileHookContributions;
    const insertItem = jest.fn().mockResolvedValue(undefined);
    const items = { insertItem } as unknown as ItHandoverRepo;
    const catalog = {
      countResponsibilitiesOf: jest
        .fn()
        .mockResolvedValue(new Map([['leaver', { subscriptions: 0, applications: 0, workspaces: 1, licenseLots: 1 }]])),
    } as unknown as CatalogResponsibilityApi;
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    } as unknown as OrganizationReadApi;

    const recorder = new ItHandoverRecorder(hooks, items, catalog, organizationReads);
    recorder.onModuleInit();

    await handler!({} as DbTx, {
      fileKind: 'OFFBOARDING',
      fileId: 'case-1',
      employeeId: 'leaver',
      dueOn: '2026-12-01',
    });

    expect(insertItem).toHaveBeenCalledWith(expect.anything(), {
      organizationId: 'org-1',
      source: { kind: 'OFFBOARDING_CASE', id: 'case-1' },
      subscriptions: 0,
      applications: 0,
      workspaces: 1,
      licenseLots: 1,
    });
  });
});
