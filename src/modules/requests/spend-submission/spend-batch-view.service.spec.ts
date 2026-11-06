import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SpendBatchRepo } from '../spend/spend-batch.repo';
import type { SpendRequestRepo } from '../spend/spend-request.repo';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import { SpendBatchViewService } from './spend-batch-view.service';

const BATCH = '0a1b2c3d-0000-4000-8000-0000000000b1';
const HEAD = 'head-employee';

const principal = (employeeId: string, roles: string[]): AuthenticatedPrincipal => ({
  subject: employeeId,
  appUserId: employeeId,
  sessionId: 's',
  employeeId,
  directRoles: roles,
  roles,
});

function build(heldBy: string[]) {
  const record = {
    id: BATCH,
    organizationId: 'org',
    departmentId: 'dep',
    submittedByEmployeeId: HEAD,
    submittedAt: new Date('2026-11-05T02:00:00.000Z'),
    itemCount: 2,
  };
  const findById = jest.fn().mockResolvedValue(record);
  const heldByMock = jest.fn().mockResolvedValue(heldBy);
  const pageItems = jest.fn().mockResolvedValue({ items: [], total: 0 });
  const service = new SpendBatchViewService(
    { findById, heldBy: heldByMock, pageItems } as unknown as SpendBatchRepo,
    { statesOf: jest.fn().mockResolvedValue(new Map()) } as unknown as SpendRequestRepo,
    { getDepartmentBrief: jest.fn().mockResolvedValue({ id: 'dep', code: 'ENG' }) } as unknown as OrganizationReadApi,
    {
      people: jest
        .fn()
        .mockResolvedValue(new Map([[HEAD, { employeeId: HEAD, employeeCode: 'NV-1', fullName: 'An Nguyen' }]])),
    } as unknown as SpendWireViewService,
  );

  return { service, heldBy: heldByMock, pageItems };
}

describe('SpendBatchViewService: who reads a batch', () => {
  it('lets Finance read a batch it did not send and holds no step of, with every item', async () => {
    const { service, heldBy, pageItems } = build([]);
    const finance = principal('finance-employee', ['FINANCE']);

    await expect(service.get(finance, BATCH)).resolves.toMatchObject({ id: BATCH, itemCount: 2 });
    await service.items(finance, BATCH, { page: 1, pageSize: 20 });

    // No narrowing to the requests a reader holds: Finance reads them all.
    expect(pageItems).toHaveBeenCalledWith(BATCH, 0, 20, undefined);
    expect(heldBy).not.toHaveBeenCalled();
  });

  it('lets the head who sent it read all of it', async () => {
    const { service, pageItems } = build([]);

    await service.items(principal(HEAD, ['MANAGER']), BATCH, { page: 1, pageSize: 20 });

    expect(pageItems).toHaveBeenCalledWith(BATCH, 0, 20, undefined);
  });

  it('lets a person who holds a spend step of the batch read the requests they hold', async () => {
    const { service, pageItems } = build(['request-1']);

    await service.items(principal('approver', ['SPENDING_APPROVER']), BATCH, { page: 1, pageSize: 20 });

    expect(pageItems).toHaveBeenCalledWith(BATCH, 0, 20, ['request-1']);
  });

  it.each([['MANAGER'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN']])(
    'answers %s who has no part in the batch as if it did not exist',
    async (role) => {
      const { service } = build([]);
      const stranger = principal('stranger', [role]);

      await expect(service.get(stranger, BATCH)).rejects.toThrow();
      await expect(service.items(stranger, BATCH, { page: 1, pageSize: 20 })).rejects.toThrow();
    },
  );
});
