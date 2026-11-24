import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import type { DeviceRecord, RegistrationRecord, RegistryRepo } from '../registry/registry.repo';
import { ConditionService } from './condition.service';
import { DeviceConditionUnchangedError, DeviceVoidedError } from './lifecycle.errors';

interface SetupOptions {
  device?: Partial<DeviceRecord> | null;
  openRegistration?: Partial<RegistrationRecord> | null;
  openReturnTask?: { found: boolean; id?: string | null; departmentId: string | null; employeeId?: string | null };
  workDepartmentId?: string | null;
  inCharge?: string | null;
  substitute?: string | null;
}

describe('ConditionService', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const actor = (employeeId = 'it-1'): AuthenticatedPrincipal =>
    ({ appUserId: `user-${employeeId}`, employeeId, roles: ['IT_ADMIN'] }) as unknown as AuthenticatedPrincipal;

  function setup(options: SetupOptions = {}) {
    const device: DeviceRecord | null =
      options.device === null
        ? null
        : {
            id: 'dev-1',
            organizationId: 'org-1',
            assetCode: 'LAP-26-0001',
            hostname: 'DES-01',
            os: 'Windows 11',
            condition: 'USABLE',
            conditionNote: null,
            retiredAt: null,
            retirementReason: null,
            retirementKind: null,
            voidedAt: null,
            ...options.device,
          };

    const open: RegistrationRecord | null = options.openRegistration
      ? {
          id: 'reg-1',
          organizationId: 'org-1',
          deviceId: 'dev-1',
          holderEmployeeId: 'emp-1',
          validFrom: '2026-10-01',
          validUntil: null,
          endedAt: null,
          endCause: null,
          collectorInstalled: true,
          acknowledgedFrom: null,
          collectionStoppedAt: null,
          ...options.openRegistration,
        }
      : null;

    const repo = {
      lockDevice: jest.fn().mockResolvedValue(device),
      lockOpenRegistration: jest.fn().mockResolvedValue(open),
      findOpenReturnTaskDepartmentId: jest
        .fn()
        .mockResolvedValue(options.openReturnTask ?? { found: false, departmentId: null }),
      updateCondition: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegistryRepo;

    const deptId = options.openReturnTask?.found
      ? options.openReturnTask.departmentId
      : options.workDepartmentId === undefined
        ? 'dept-1'
        : options.workDepartmentId;
    const actors = [options.inCharge === undefined ? 'it-1' : options.inCharge, options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
      workDepartmentsOf: jest.fn().mockResolvedValue(deptId ? new Map([['emp-1', deptId]]) : new Map()),
      itAdminsActingFor: jest.fn().mockResolvedValue(
        deptId
          ? new Map([
              [
                deptId,
                {
                  inCharge: options.inCharge === undefined ? 'it-1' : options.inCharge,
                  substitute: options.substitute ?? null,
                  actors,
                },
              ],
            ])
          : new Map(),
      ),
    } as unknown as OrganizationReadApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actors)),
    } as unknown as IdentityAccessApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
    const runner = {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;

    const service = new ConditionService(repo, organizationReads, identity, audit, runner);

    return { service, repo, audit };
  }

  const firstAudit = (audit: AuditApi): { before: unknown; after: Record<string, unknown> } => {
    const calls = (audit.record as jest.Mock).mock.calls as Array<
      [unknown, { before: unknown; after: Record<string, unknown> }]
    >;
    return calls[0][1];
  };

  it('allows any IT Admin to update an IN_STOCK machine condition without changing holder state', async () => {
    const { service, repo, audit } = setup();

    await service.changeCondition(
      actor('it-other'),
      'dev-1',
      { condition: 'IN_REPAIR', note: 'Screen hinge broken' },
      now,
    );

    expect((repo as unknown as { updateCondition: jest.Mock }).updateCondition).toHaveBeenCalledWith(
      tx,
      'dev-1',
      'IN_REPAIR',
      'Screen hinge broken',
    );
    expect(firstAudit(audit)).toMatchObject({
      before: { condition: 'USABLE', conditionNote: null },
      after: { condition: 'IN_REPAIR', conditionNote: 'Screen hinge broken' },
    });
  });

  it('enforces acting IT Admin for ASSIGNED and AWAITING_RETURN devices and audits bySubstitute', async () => {
    const assignedDenied = setup({ openRegistration: { holderEmployeeId: 'emp-1' }, inCharge: 'it-1' });
    await expect(
      assignedDenied.service.changeCondition(actor('it-other'), 'dev-1', { condition: 'BROKEN' }, now),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const assignedSub = setup({
      openRegistration: { holderEmployeeId: 'emp-1' },
      inCharge: 'it-1',
      substitute: 'it-sub',
    });
    await assignedSub.service.changeCondition(actor('it-sub'), 'dev-1', { condition: 'IN_REPAIR' }, now);
    expect(firstAudit(assignedSub.audit).after).toEqual({
      condition: 'IN_REPAIR',
      conditionNote: null,
      bySubstitute: true,
    });

    const awaitingDenied = setup({
      openReturnTask: { found: true, departmentId: 'dept-ret' },
      inCharge: 'it-ret',
    });
    await expect(
      awaitingDenied.service.changeCondition(actor('it-other'), 'dev-1', { condition: 'BROKEN' }, now),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const awaitingDeparting = setup({
      openReturnTask: { found: true, id: 'task-1', departmentId: 'dept-ret', employeeId: 'it-ret' },
      inCharge: 'it-ret',
      substitute: 'it-sub',
    });
    await expect(
      awaitingDeparting.service.changeCondition(actor('it-ret'), 'dev-1', { condition: 'BROKEN' }, now),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    await awaitingDeparting.service.changeCondition(actor('it-sub'), 'dev-1', { condition: 'BROKEN' }, now);
    expect(firstAudit(awaitingDeparting.audit).after).toEqual({
      condition: 'BROKEN',
      conditionNote: null,
      bySubstitute: true,
    });
  });

  it('rejects missing, voided, retired, or unchanged condition', async () => {
    await expect(
      setup({ device: null }).service.changeCondition(actor(), 'dev-1', { condition: 'BROKEN' }, now),
    ).rejects.toBeInstanceOf(DeviceNotFoundError);
    await expect(
      setup({ device: { voidedAt: now } }).service.changeCondition(actor(), 'dev-1', { condition: 'BROKEN' }, now),
    ).rejects.toBeInstanceOf(DeviceVoidedError);
    await expect(
      setup({ device: { retiredAt: now } }).service.changeCondition(actor(), 'dev-1', { condition: 'BROKEN' }, now),
    ).rejects.toBeInstanceOf(DeviceAlreadyRetiredError);
    await expect(
      setup({ device: { condition: 'IN_REPAIR' } }).service.changeCondition(
        actor(),
        'dev-1',
        { condition: 'IN_REPAIR' },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceConditionUnchangedError);
  });
});
