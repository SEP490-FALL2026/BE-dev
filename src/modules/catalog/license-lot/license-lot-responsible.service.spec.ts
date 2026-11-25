import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { WorkspaceViewService } from '../workspace/workspace-view.service';
import { LicenseLotNotFoundError, LicenseLotResponsibleNotItAdminError } from './license-lot.errors';
import type { LicenseLotRepo } from './license-lot.repo';
import type { LicenseLotDetail, LicenseLotRecord } from './license-lot.types';
import type { LicenseLotViewService } from './license-lot-view.service';
import { LicenseLotResponsibleService } from './license-lot-responsible.service';

const tx = { tag: 'tx' };
const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
const actor = {
  appUserId: 'u-sa',
  sessionId: 's-1',
  employeeId: 'emp-sa',
  roles: ['SUPER_ADMIN'],
} as unknown as AuthenticatedPrincipal;

function setup(options: { lot?: Partial<LicenseLotRecord> | null; usable?: boolean } = {}) {
  const lots = {
    lock: jest
      .fn()
      .mockResolvedValue(
        options.lot === null
          ? null
          : ({ id: 'lot-1', responsibleItAdminEmployeeId: 'emp-it1', ...options.lot } as LicenseLotRecord),
      ),
    setResponsible: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue({ id: 'lot-1' }),
  };
  const view = { id: 'lot-1' } as unknown as LicenseLotDetail;
  const views = { viewAll: jest.fn().mockResolvedValue([view]) };
  const workspaces = { isUsableItAdmin: jest.fn().mockResolvedValue(options.usable ?? true) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const organizationReads = { getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }) };
  const service = new LicenseLotResponsibleService(
    lots as unknown as LicenseLotRepo,
    views as unknown as LicenseLotViewService,
    workspaces as unknown as WorkspaceViewService,
    organizationReads as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
    runner,
  );

  return { service, lots, audit, view };
}

describe('LicenseLotResponsibleService (the Super Admin names who answers for a lot)', () => {
  it('writes the IT Admin named on the lot, locked first, and records who, from whom, to whom and why', async () => {
    const { service, lots, audit, view } = setup();

    await expect(service.change(actor, 'lot-1', { employeeId: 'emp-it2', reason: 'Handover' })).resolves.toEqual({
      lot: view,
      changed: true,
    });

    expect(lots.lock).toHaveBeenCalledWith(tx, 'lot-1');
    expect(lots.setResponsible).toHaveBeenCalledWith(tx, 'lot-1', 'emp-it2');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'LICENSE_LOT.RESPONSIBLE_CHANGED',
        resourceType: 'LicenseLot',
        before: { responsibleItAdminEmployeeId: 'emp-it1' },
        after: { responsibleItAdminEmployeeId: 'emp-it2', reason: 'Handover' },
      }),
    );
  });

  it('writes nothing and says so when the one named already answers for the lot', async () => {
    const { service, lots, audit } = setup();

    await expect(service.change(actor, 'lot-1', { employeeId: 'emp-it1', reason: 'Same' })).resolves.toMatchObject({
      changed: false,
    });

    expect(lots.setResponsible).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses a person who is not an IT Admin who works now, and a lot that does not exist', async () => {
    await expect(
      setup({ usable: false }).service.change(actor, 'lot-1', { employeeId: 'emp-x', reason: 'x' }),
    ).rejects.toThrow(LicenseLotResponsibleNotItAdminError);
    await expect(
      setup({ lot: null }).service.change(actor, 'lot-9', { employeeId: 'emp-it2', reason: 'x' }),
    ).rejects.toThrow(LicenseLotNotFoundError);
  });
});
