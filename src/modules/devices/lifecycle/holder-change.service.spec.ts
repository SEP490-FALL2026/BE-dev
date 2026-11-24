import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import type { RegistrationEndService } from '../registry/registration-end.service';
import {
  DeviceAlreadyRetiredError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DeviceHolderUnchangedError,
} from '../registry/registry.errors';
import type { DeviceRecord, RegistrationRecord, RegistryRepo } from '../registry/registry.repo';
import { HolderChangeService } from './holder-change.service';
import {
  DeviceAwaitingReturnError,
  DeviceNotUsableError,
  DeviceSoftwareRemovalNoteRequiredError,
  DeviceSoftwareRemovalRequiredError,
  DeviceVoidedError,
} from './lifecycle.errors';

interface SetupOptions {
  device?: Partial<DeviceRecord> | null;
  openRegistration?: Partial<RegistrationRecord> | null;
  hasOpenReturnTask?: boolean;
  recipient?: {
    id: string;
    status: string;
    workState: string;
    hireDate: string;
  } | null;
  workDepartments?: Map<string, string | null>;
  actingByDepartment?: Map<string, { inCharge: string | null; substitute: string | null; actors: string[] }>;
}

describe('HolderChangeService', () => {
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
          id: 'reg-old',
          organizationId: 'org-1',
          deviceId: 'dev-1',
          holderEmployeeId: 'emp-old',
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
      hasOpenReturnTask: jest.fn().mockResolvedValue(options.hasOpenReturnTask ?? false),
      insertRegistration: jest.fn().mockResolvedValue({
        id: 'reg-new',
        organizationId: 'org-1',
        deviceId: 'dev-1',
        holderEmployeeId: 'emp-new',
        validFrom: '2026-11-24',
        validUntil: null,
        endedAt: null,
        endCause: null,
        collectorInstalled: true,
        acknowledgedFrom: null,
        collectionStoppedAt: null,
      }),
    } as unknown as RegistryRepo;

    const ending = { end: jest.fn().mockResolvedValue(undefined) } as unknown as RegistrationEndService;
    const recipient =
      options.recipient === undefined
        ? { id: 'emp-new', status: 'ACTIVE', workState: 'WORKING', hireDate: '2025-01-01' }
        : options.recipient;
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      getEmployee: jest.fn().mockResolvedValue(recipient),
      lockEmployeeForShare: jest.fn().mockResolvedValue(undefined),
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
      workDepartmentsOf: jest.fn().mockResolvedValue(options.workDepartments ?? new Map([['emp-new', 'dept-new']])),
      itAdminsActingFor: jest
        .fn()
        .mockResolvedValue(
          options.actingByDepartment ??
            new Map([['dept-new', { inCharge: 'it-1', substitute: null, actors: ['it-1'] }]]),
        ),
      itAdminsActingForUnplacedWork: jest.fn().mockResolvedValue(new Map()),
    } as unknown as OrganizationReadApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['it-1', 'it-sub'])),
    } as unknown as IdentityAccessApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
    const runner = {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;

    const service = new HolderChangeService(repo, ending, organizationReads, identity, audit, runner);

    return { service, repo, ending, audit };
  }

  const firstAuditAfter = (audit: AuditApi): Record<string, unknown> => {
    const calls = (audit.record as jest.Mock).mock.calls as Array<[unknown, { after: Record<string, unknown> }]>;
    return calls[0][1].after;
  };

  it('hands over an IN_STOCK usable device without requiring softwareRemoval and audits bySubstitute', async () => {
    const { service, repo, ending, audit } = setup({
      actingByDepartment: new Map([
        ['dept-new', { inCharge: 'it-in', substitute: 'it-sub', actors: ['it-in', 'it-sub'] }],
      ]),
    });

    await service.changeHolder(
      actor('it-sub'),
      'dev-1',
      { holderEmployeeId: 'emp-new', collectorInstalled: false, softwareRemoval: { outcome: 'REMOVED' } },
      now,
    );

    expect((ending as unknown as { end: jest.Mock }).end).not.toHaveBeenCalled();
    expect((repo as unknown as { insertRegistration: jest.Mock }).insertRegistration).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ holderEmployeeId: 'emp-new', collectorInstalled: false }),
    );
    expect(firstAuditAfter(audit)).toEqual({
      holderEmployeeId: 'emp-new',
      registrationId: 'reg-new',
      validFrom: '2026-11-24',
      collectorInstalled: false,
      bySubstitute: true,
    });
  });

  it('requires softwareRemoval (and note for NOT_REMOVABLE) when reassigning an ASSIGNED device', async () => {
    const missingRemoval = setup({
      openRegistration: { holderEmployeeId: 'emp-old' },
      workDepartments: new Map([
        ['emp-old', 'dept-1'],
        ['emp-new', 'dept-1'],
      ]),
      actingByDepartment: new Map([['dept-1', { inCharge: 'it-1', substitute: null, actors: ['it-1'] }]]),
    });
    await expect(
      missingRemoval.service.changeHolder(
        actor(),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceSoftwareRemovalRequiredError);

    const missingNote = setup({
      openRegistration: { holderEmployeeId: 'emp-old' },
      workDepartments: new Map([
        ['emp-old', 'dept-1'],
        ['emp-new', 'dept-1'],
      ]),
      actingByDepartment: new Map([['dept-1', { inCharge: 'it-1', substitute: null, actors: ['it-1'] }]]),
    });
    await expect(
      missingNote.service.changeHolder(
        actor(),
        'dev-1',
        {
          holderEmployeeId: 'emp-new',
          collectorInstalled: true,
          softwareRemoval: { outcome: 'NOT_REMOVABLE', note: '   ' },
        },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceSoftwareRemovalNoteRequiredError);

    const valid = setup({
      openRegistration: { holderEmployeeId: 'emp-old' },
      workDepartments: new Map([
        ['emp-old', 'dept-1'],
        ['emp-new', 'dept-1'],
      ]),
      actingByDepartment: new Map([['dept-1', { inCharge: 'it-1', substitute: null, actors: ['it-1'] }]]),
    });
    await valid.service.changeHolder(
      actor(),
      'dev-1',
      { holderEmployeeId: 'emp-new', collectorInstalled: true, softwareRemoval: { outcome: 'REMOVED' } },
      now,
    );
    expect((valid.ending as unknown as { end: jest.Mock }).end).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'reg-old' }),
      { at: now, cause: 'HOLDER_CHANGED', softwareRemoval: { outcome: 'REMOVED', note: null } },
      expect.anything(),
    );
    expect(firstAuditAfter(valid.audit)).toMatchObject({
      collectorInstalled: true,
      softwareRemoval: { outcome: 'REMOVED', note: null },
    });
  });

  it('enforces SPEC W2-06 state precedence before holder errors', async () => {
    await expect(
      setup({ device: null }).service.changeHolder(
        actor(),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceNotFoundError);
    await expect(
      setup({ device: { voidedAt: now }, recipient: null }).service.changeHolder(
        actor(),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceVoidedError);
    await expect(
      setup({ device: { retiredAt: now }, recipient: null }).service.changeHolder(
        actor(),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceAlreadyRetiredError);
    await expect(
      setup({ hasOpenReturnTask: true }).service.changeHolder(
        actor(),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceAwaitingReturnError);
    await expect(
      setup({ device: { condition: 'BROKEN' }, recipient: null }).service.changeHolder(
        actor(),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceNotUsableError);
    await expect(
      setup({ openRegistration: { holderEmployeeId: 'emp-new' } }).service.changeHolder(
        actor(),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceHolderUnchangedError);
    await expect(
      setup({ recipient: null }).service.changeHolder(
        actor(),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceHolderNotFoundError);
    await expect(
      setup({
        recipient: { id: 'emp-new', status: 'ACTIVE', workState: 'LEFT', hireDate: '2025-01-01' },
      }).service.changeHolder(actor(), 'dev-1', { holderEmployeeId: 'emp-new', collectorInstalled: true }, now),
    ).rejects.toBeInstanceOf(DeviceHolderNotWorkingError);
  });

  it('requires acting IT Admin for both old holder department and new recipient department', async () => {
    const partial = setup({
      openRegistration: { holderEmployeeId: 'emp-old' },
      workDepartments: new Map([
        ['emp-old', 'dept-old'],
        ['emp-new', 'dept-new'],
      ]),
      actingByDepartment: new Map([
        ['dept-old', { inCharge: 'it-1', substitute: null, actors: ['it-1'] }],
        ['dept-new', { inCharge: 'it-2', substitute: null, actors: ['it-2'] }],
      ]),
    });
    await expect(
      partial.service.changeHolder(
        actor('it-1'),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true, softwareRemoval: { outcome: 'REMOVED' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const unplaced = setup({
      workDepartments: new Map([['emp-new', null]]),
      actingByDepartment: new Map(),
    });
    await expect(
      unplaced.service.changeHolder(
        actor('it-1'),
        'dev-1',
        { holderEmployeeId: 'emp-new', collectorInstalled: true },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const bothCovered = setup({
      openRegistration: { holderEmployeeId: 'emp-old' },
      workDepartments: new Map([
        ['emp-old', 'dept-old'],
        ['emp-new', 'dept-new'],
      ]),
      actingByDepartment: new Map([
        ['dept-old', { inCharge: 'it-1', substitute: null, actors: ['it-1'] }],
        ['dept-new', { inCharge: 'it-2', substitute: 'it-1', actors: ['it-2', 'it-1'] }],
      ]),
    });
    await bothCovered.service.changeHolder(
      actor('it-1'),
      'dev-1',
      { holderEmployeeId: 'emp-new', collectorInstalled: true, softwareRemoval: { outcome: 'REMOVED' } },
      now,
    );
    expect(firstAuditAfter(bothCovered.audit)).toMatchObject({ bySubstitute: true });
  });
});
