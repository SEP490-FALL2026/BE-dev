import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import {
  DeviceActivationNotMovableError,
  DeviceActivationNotOnDeviceError,
} from '../../licensing/public/licensing-device-activation.errors';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import {
  DeviceAlreadyRetiredError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
} from '../registry/registry.errors';
import type { DeviceRecord, RegistrationRecord, RegistryRepo } from '../registry/registry.repo';
import type { DeviceReceiptService } from './device-receipt.service';
import {
  DeviceAwaitingReturnError,
  DeviceNotHeldError,
  DeviceNotUsableError,
  DeviceReplacementNotInStockError,
  DeviceSameDeviceError,
  DeviceSoftwareRemovalNoteRequiredError,
  DeviceVoidedError,
} from './lifecycle.errors';
import { toLifecycleApiException } from './lifecycle.http-errors';
import { ReplacementService, type DeviceReplacementInput } from './replacement.service';

interface SetupOptions {
  oldDevice?: Partial<DeviceRecord> | null;
  replacementDevice?: Partial<DeviceRecord> | null;
  oldOpen?: Partial<RegistrationRecord> | null;
  replacementOpen?: Partial<RegistrationRecord> | null;
  oldReturnTask?: boolean;
  replacementReturnTask?: boolean;
  holder?: { id: string; status: string; workState: string; hireDate: string } | null;
  inCharge?: string | null;
  substitute?: string | null;
  openActivations?: Array<{
    id: string;
    deviceId: string;
    planId: string;
    licenseKeyId: string | null;
    subscriptionId: string | null;
  }>;
}

describe('ReplacementService', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const actor = (employeeId = 'it-1'): AuthenticatedPrincipal =>
    ({
      appUserId: `user-${employeeId}`,
      employeeId,
      sessionId: `sess-${employeeId}`,
      roles: ['IT_ADMIN'],
    }) as unknown as AuthenticatedPrincipal;

  const baseDevice = (id: string, over?: Partial<DeviceRecord>): DeviceRecord => ({
    id,
    organizationId: 'org-1',
    assetCode: `LAP-${id}`,
    hostname: `HOST-${id}`,
    os: 'Windows 11',
    condition: 'USABLE',
    conditionNote: null,
    retiredAt: null,
    retirementReason: null,
    retirementKind: null,
    voidedAt: null,
    ...over,
  });

  function setup(options: SetupOptions = {}) {
    const oldDev = options.oldDevice === null ? null : baseDevice('dev-old', options.oldDevice);
    const repDev = options.replacementDevice === null ? null : baseDevice('dev-rep', options.replacementDevice);

    const oldOpen: RegistrationRecord | null =
      options.oldOpen === null
        ? null
        : {
            id: 'reg-old',
            organizationId: 'org-1',
            deviceId: 'dev-old',
            holderEmployeeId: 'emp-1',
            validFrom: '2026-10-01',
            validUntil: null,
            endedAt: null,
            endCause: null,
            collectorInstalled: true,
            acknowledgedFrom: null,
            collectionStoppedAt: null,
            ...options.oldOpen,
          };

    const repOpen: RegistrationRecord | null = options.replacementOpen
      ? {
          id: 'reg-rep-existing',
          organizationId: 'org-1',
          deviceId: 'dev-rep',
          holderEmployeeId: 'emp-2',
          validFrom: '2026-10-01',
          validUntil: null,
          endedAt: null,
          endCause: null,
          collectorInstalled: true,
          acknowledgedFrom: null,
          collectionStoppedAt: null,
          ...options.replacementOpen,
        }
      : null;

    const insertRegistration = jest.fn().mockResolvedValue({ id: 'reg-new' });
    const lockDevices = jest.fn().mockResolvedValue([oldDev, repDev].filter((d): d is DeviceRecord => d !== null));
    const repo = {
      findOpenRegistration: jest.fn().mockResolvedValue(oldOpen),
      lockDevices,
      lockOpenRegistration: jest.fn().mockImplementation((_tx: DbTx, id: string) => {
        if (id === 'dev-old') return Promise.resolve(oldOpen);
        if (id === 'dev-rep') return Promise.resolve(repOpen);
        return Promise.resolve(null);
      }),
      hasOpenReturnTask: jest.fn().mockImplementation((_tx: DbTx, id: string) => {
        if (id === 'dev-old') return Promise.resolve(options.oldReturnTask ?? false);
        return Promise.resolve(options.replacementReturnTask ?? false);
      }),
      insertRegistration,
    } as unknown as RegistryRepo;

    const receive = jest.fn().mockResolvedValue(undefined);
    const receipts = { receive } as unknown as DeviceReceiptService;
    const move = jest.fn().mockImplementation((_tx: DbTx, input: { activationId: string }) =>
      Promise.resolve({
        activation: { id: `moved-${input.activationId}` },
        overActivationCap: input.activationId === 'act-over',
      }),
    );
    const activations = {
      openOfDevice: jest.fn().mockResolvedValue(options.openActivations ?? []),
      move,
    } as unknown as LicensingDeviceActivationApi;

    const holder =
      options.holder === undefined
        ? { id: 'emp-1', status: 'ACTIVE', workState: 'WORKING', hireDate: '2025-01-01' }
        : options.holder;
    const actors = [options.inCharge === undefined ? 'it-1' : options.inCharge, options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );
    const lockEmployeeForShare = jest.fn().mockResolvedValue(undefined);
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      getEmployee: jest.fn().mockResolvedValue(holder),
      lockEmployeeForShare,
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
      workDepartmentsOf: jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']])),
      itAdminsActingFor: jest.fn().mockResolvedValue(
        new Map([
          [
            'dept-1',
            {
              inCharge: options.inCharge === undefined ? 'it-1' : options.inCharge,
              substitute: options.substitute ?? null,
              actors,
            },
          ],
        ]),
      ),
    } as unknown as OrganizationReadApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actors)),
    } as unknown as IdentityAccessApi;
    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const audit = { record: auditRecord } as unknown as AuditApi;
    const runner = {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;

    const service = new ReplacementService(repo, receipts, activations, organizationReads, identity, audit, runner);

    return {
      service,
      mocks: { insertRegistration, lockDevices, receive, move, lockEmployeeForShare, auditRecord },
    };
  }

  const expectErrorCode = async (
    promise: Promise<unknown>,
    errorClass: new (...args: never[]) => Error,
    code: string,
  ) => {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(errorClass);
    const mapped = toLifecycleApiException(caught) as ApiException;
    expect((mapped.getResponse() as { code: string }).code).toBe(code);
  };

  it('replaces an assigned machine, moves selected keyed activations in sorted subscription order, and records one audit', async () => {
    const callOrder: string[] = [];
    const { service, mocks } = setup({
      substitute: 'it-sub',
      openActivations: [
        { id: 'act-b', deviceId: 'dev-old', planId: 'p2', licenseKeyId: 'k2', subscriptionId: 'sub-2' },
        { id: 'act-over', deviceId: 'dev-old', planId: 'p1', licenseKeyId: 'k1', subscriptionId: 'sub-1' },
        { id: 'act-stay', deviceId: 'dev-old', planId: 'p3', licenseKeyId: 'k3', subscriptionId: 'sub-3' },
      ],
    });
    mocks.lockEmployeeForShare.mockImplementation(() => {
      callOrder.push('tier1:emp');
      return Promise.resolve();
    });
    mocks.lockDevices.mockImplementation(() => {
      callOrder.push('tier2b:devices');
      return Promise.resolve([baseDevice('dev-old'), baseDevice('dev-rep')]);
    });

    const result = await service.replace(
      actor('it-sub'),
      'dev-old',
      {
        replacementDeviceId: 'dev-rep',
        condition: 'IN_REPAIR',
        conditionNote: 'Fan noisy',
        softwareRemoval: { outcome: 'REMOVED' },
        collectorInstalled: true,
        activations: [
          { activationId: 'act-b', action: 'MOVE' },
          { activationId: 'act-over', action: 'MOVE' },
          { activationId: 'act-stay', action: 'STAY' },
        ],
      },
      now,
    );

    expect(callOrder).toEqual(['tier1:emp', 'tier2b:devices']);
    expect(mocks.receive).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        deviceId: 'dev-old',
        condition: 'IN_REPAIR',
        conditionNote: 'Fan noisy',
        softwareRemoval: { outcome: 'REMOVED', note: null },
        recordAudit: false,
      }),
    );
    expect(mocks.insertRegistration).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        deviceId: 'dev-rep',
        holderEmployeeId: 'emp-1',
        validFrom: '2026-11-24',
        collectorInstalled: true,
      }),
    );
    expect(mocks.move.mock.calls.map((c: unknown[]) => (c[1] as { activationId: string }).activationId)).toEqual([
      'act-over',
      'act-b',
    ]);
    expect(result).toEqual({
      returnedDeviceId: 'dev-old',
      replacementDeviceId: 'dev-rep',
      movedActivations: [
        { activationId: 'act-over', overActivationCap: true },
        { activationId: 'act-b', overActivationCap: false },
      ],
    });
    const auditEvent = (
      mocks.auditRecord.mock.calls as Array<
        [unknown, { action: string; resourceId: string; after: Record<string, unknown> }]
      >
    )[0][1];
    expect(auditEvent.action).toBe('DEVICE.REPLACED');
    expect(auditEvent.resourceId).toBe('dev-old');
    expect(auditEvent.after).toMatchObject({
      oldDeviceId: 'dev-old',
      replacementDeviceId: 'dev-rep',
      movedCount: 2,
      bySubstitute: true,
    });
  });

  it('rejects invalid activations (not on device or bundled) before writing anything', async () => {
    const baseInput = {
      replacementDeviceId: 'dev-rep',
      condition: 'USABLE' as const,
      softwareRemoval: { outcome: 'REMOVED' as const },
      collectorInstalled: false,
    };

    const notOnDevice = setup({ openActivations: [] });
    await expectErrorCode(
      notOnDevice.service.replace(
        actor(),
        'dev-old',
        { ...baseInput, activations: [{ activationId: 'act-missing', action: 'MOVE' }] },
        now,
      ),
      DeviceActivationNotOnDeviceError,
      'DEVICE_ACTIVATION.NOT_ON_DEVICE',
    );
    expect(notOnDevice.mocks.receive).not.toHaveBeenCalled();

    const bundled = setup({
      openActivations: [{ id: 'act-oem', deviceId: 'dev-old', planId: 'p1', licenseKeyId: null, subscriptionId: null }],
    });
    await expectErrorCode(
      bundled.service.replace(
        actor(),
        'dev-old',
        { ...baseInput, activations: [{ activationId: 'act-oem', action: 'MOVE' }] },
        now,
      ),
      DeviceActivationNotMovableError,
      'DEVICE_ACTIVATION.NOT_MOVABLE',
    );
    expect(bundled.mocks.receive).not.toHaveBeenCalled();
  });

  it('enforces all custody, holder, removal note, and acting IT Admin errors with exact codes', async () => {
    const input: DeviceReplacementInput = {
      replacementDeviceId: 'dev-rep',
      condition: 'USABLE',
      softwareRemoval: { outcome: 'REMOVED' },
      collectorInstalled: true,
    };
    const cases: Array<
      [SetupOptions, Partial<DeviceReplacementInput>, string, new (...args: never[]) => Error, string]
    > = [
      [{}, { replacementDeviceId: 'dev-old' }, 'it-1', DeviceSameDeviceError, 'DEVICE.SAME_DEVICE'],
      [{ replacementDevice: null }, {}, 'it-1', DeviceNotFoundError, 'DEVICE.NOT_FOUND'],
      [{ oldDevice: { voidedAt: now } }, {}, 'it-1', DeviceVoidedError, 'DEVICE.VOIDED'],
      [{ oldDevice: { retiredAt: now } }, {}, 'it-1', DeviceAlreadyRetiredError, 'DEVICE.ALREADY_RETIRED'],
      [{ oldReturnTask: true }, {}, 'it-1', DeviceAwaitingReturnError, 'DEVICE.AWAITING_RETURN'],
      [{ oldOpen: null }, {}, 'it-1', DeviceNotHeldError, 'DEVICE.NOT_HELD'],
      [
        { replacementOpen: { holderEmployeeId: 'emp-2' } },
        {},
        'it-1',
        DeviceReplacementNotInStockError,
        'DEVICE.REPLACEMENT_NOT_IN_STOCK',
      ],
      [{ replacementDevice: { condition: 'BROKEN' } }, {}, 'it-1', DeviceNotUsableError, 'DEVICE.NOT_USABLE'],
      [{ holder: null }, {}, 'it-1', DeviceHolderNotFoundError, 'DEVICE.HOLDER_NOT_FOUND'],
      [
        { holder: { id: 'emp-1', status: 'ACTIVE', workState: 'LEFT', hireDate: '2025-01-01' } },
        {},
        'it-1',
        DeviceHolderNotWorkingError,
        'DEVICE.HOLDER_NOT_WORKING',
      ],
      [
        {},
        { softwareRemoval: { outcome: 'NOT_REMOVABLE', note: ' ' } },
        'it-1',
        DeviceSoftwareRemovalNoteRequiredError,
        'DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED',
      ],
      [{ inCharge: 'it-1' }, {}, 'it-other', DeviceNotInChargeError, 'DEVICE.NOT_IN_CHARGE'],
    ];

    for (const [opts, over, empId, errorClass, code] of cases) {
      await expectErrorCode(
        setup(opts).service.replace(actor(empId), 'dev-old', { ...input, ...over }, now),
        errorClass,
        code,
      );
    }
  });
});
