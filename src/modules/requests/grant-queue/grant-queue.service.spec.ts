import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import type { LicensingPoolStockApi } from '../../licensing/public/licensing-pool-stock.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GrantQueueService } from './grant-queue.service';
import type { GrantQueueRepo, WaitingRequestRow } from './grant-queue.repo';

const waiting: WaitingRequestRow = {
  id: 'r1',
  type: 'GRANT',
  boundaryState: null,
  planId: 'p1',
  departmentId: 'd1',
  requesterEmployeeId: 'e1',
  beneficiaryEmployeeId: 'e2',
  expectedEndDate: null,
  submittedAt: new Date('2026-11-01T00:00:00Z'),
  lineCount: 1,
  state: 'WAITING',
  withdrawing: false,
};
const person = (id: string) => ({ id, employeeCode: `E-${id}`, fullName: id });
const plan = { planId: 'p1', planName: 'Teams', applicationName: 'Slack', applicationLogoUrl: null };
const department = { id: 'd1', name: 'Design' };

/** The service over collaborators that answer a page of one waiting request; what is missing from the page is what each case leaves out. */
function serviceWith(found: { plans: unknown[]; departments: unknown[] }): GrantQueueService {
  const queue = { page: () => Promise.resolve({ rows: [waiting], total: 1 }) } as unknown as GrantQueueRepo;
  const catalog = { getPlanSummariesWithLogo: () => Promise.resolve(found.plans) } as unknown as CatalogApi;
  const organization = {
    getItAdminScope: () => Promise.resolve(['d1']),
    getEmployees: () => Promise.resolve([person('e1'), person('e2')]),
    getDepartmentBriefs: () => Promise.resolve(found.departments),
  } as unknown as OrganizationReadApi;
  const identity = { findUsableItAdminEmployeeIds: () => Promise.resolve([]) } as unknown as IdentityAccessApi;
  const pool = { getStockOfPlans: () => Promise.resolve(new Map()) } as unknown as LicensingPoolStockApi;
  const grants = { listGrantExecutionsOfRequests: () => Promise.resolve([]) } as unknown as LicensingOpenGrantsApi;

  return new GrantQueueService(queue, catalog, organization, identity, pool, grants);
}

const actor = { employeeId: 'it1' } as AuthenticatedPrincipal;
const query = { page: 1, pageSize: 20 };

describe('GrantQueueService.page: a row whose plan or department cannot be read is corrupt data, never a shorter page', () => {
  it('answers a row for each waiting request when its plan and department are there', async () => {
    const page = await serviceWith({ plans: [plan], departments: [department] }).page(actor, query);

    expect(page.items.map((item) => item.requestId)).toEqual(['r1']);
    expect(page.pagination.totalItems).toBe(1);
  });

  it('throws for a row with no plan, as it does for one with no person, so the total never counts a row the page leaves out', async () => {
    await expect(serviceWith({ plans: [], departments: [department] }).page(actor, query)).rejects.toThrow(/plan p1/);
  });

  it('throws for a row with no department', async () => {
    await expect(serviceWith({ plans: [plan], departments: [] }).page(actor, query)).rejects.toThrow(/department d1/);
  });
});
