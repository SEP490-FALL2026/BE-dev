import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationApi } from '../../organization/public/organization.api';
import type { MyRightRow, MySoftwareRepo } from './my-software.repo';
import { MySoftwareService } from './my-software.service';

const TODAY = '2026-10-23';
const PLAN_K4 = '00000000-0000-4000-8000-000000000004';
const PLAN_K1 = '00000000-0000-4000-8000-000000000001';
const actor = { employeeId: 'e1', roles: ['EMPLOYEE'] } as unknown as AuthenticatedPrincipal;

const row = (assignmentId: string, planId: string, facts: Partial<MyRightRow> = {}): MyRightRow => ({
  assignmentId,
  planId,
  effectiveFrom: '2026-01-05',
  effectiveFromBasis: 'ACTUAL',
  validUntil: null,
  expectedEndDate: null,
  grantOpen: false,
  revocationOpen: false,
  accessUntilPaidEnd: false,
  continued: false,
  successorAssignmentId: null,
  ...facts,
});

function serviceWith(rows: MyRightRow[]) {
  const page = jest.fn().mockResolvedValue({ items: rows, total: rows.length });
  const plans = jest.fn().mockResolvedValue([
    {
      planId: PLAN_K4,
      planName: 'Office 2021',
      applicationId: 'a4',
      applicationName: 'Office',
      provisioningType: 'K4',
      revocationNote: 'Uninstall from the device',
      dataLossOnRemoval: true,
    },
    {
      planId: PLAN_K1,
      planName: 'Notion Plus',
      applicationId: 'a1',
      applicationName: 'Notion',
      provisioningType: 'K1',
      revocationNote: null,
      dataLossOnRemoval: false,
    },
  ]);
  const service = new MySoftwareService(
    { page } as unknown as MySoftwareRepo,
    { businessToday: jest.fn().mockResolvedValue(TODAY) } as unknown as OrganizationApi,
    { getPlanRevocationInfo: plans } as unknown as CatalogApi,
  );

  return { service, page, plans };
}

describe('MySoftwareService', () => {
  it('reads only the caller, on the business day, and names every plan of the page in one call', async () => {
    const { service, page, plans } = serviceWith([row('r1', PLAN_K4), row('r2', PLAN_K1), row('r3', PLAN_K1)]);

    const result = await service.list(actor, { view: 'current', page: 2, pageSize: 3 });

    expect(page).toHaveBeenCalledWith('e1', 'current', TODAY, { skip: 3, take: 3 });
    expect(plans).toHaveBeenCalledTimes(1);
    expect(plans).toHaveBeenCalledWith([PLAN_K4, PLAN_K1]);
    expect(result.asOf).toBe(TODAY);
    expect(result.page.items.map((item) => item.provisioningType)).toEqual(['K4', 'K1', 'K1']);
  });

  it('answers the kind, the status and the end of a right, and nothing of how it is removed', async () => {
    const { service } = serviceWith([
      row('r1', PLAN_K4),
      row('r2', PLAN_K1, { expectedEndDate: '2026-10-30', effectiveFromBasis: 'RECORDED' }),
    ]);

    const [office, notion] = (await service.list(actor, { view: 'current', page: 1, pageSize: 20 })).page.items;

    expect(office).toEqual({
      assignmentId: 'r1',
      application: { id: 'a4', name: 'Office' },
      plan: { id: PLAN_K4, name: 'Office 2021' },
      provisioningType: 'K4',
      status: 'ACTIVE',
      effectiveFrom: '2026-01-05',
      grantedOn: '2026-01-05',
      effectiveFromLabel: null,
      expectedEndDate: null,
      expiringSoon: false,
      validUntil: null,
      successorAssignmentId: null,
    });
    expect(notion).toMatchObject({
      status: 'ACTIVE',
      expectedEndDate: '2026-10-30',
      expiringSoon: true,
      grantedOn: null,
    });
    expect(notion.effectiveFromLabel).toContain('05/01/2026');
    expect(JSON.stringify(office)).not.toContain('Uninstall');
  });

  it('answers an empty page without asking the catalog for anything', async () => {
    const { service, plans } = serviceWith([]);

    const result = await service.list(actor, { view: 'ended', page: 1, pageSize: 20 });

    expect(result.page).toEqual({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    expect(result.view).toBe('ended');
    expect(plans).not.toHaveBeenCalled();
  });
});
