import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotFoundError } from '../public/devices.errors';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import type { DeviceRecord, RegistrationRecord, RegistryRepo } from '../registry/registry.repo';
import { DeviceVoidedError, DeviceVoidRefusedError } from './lifecycle.errors';
import { toLifecycleApiException } from './lifecycle.http-errors';
import { VoidService } from './void.service';

interface SetupOptions {
  device?: Partial<DeviceRecord> | null;
  openRegistration?: Partial<RegistrationRecord> | null;
  hasOpenReturnTask?: boolean;
  hasSignatureRecord?: boolean;
  hasCredential?: boolean;
  hasKeyActivationHistory?: boolean;
}

describe('VoidService', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const actor: AuthenticatedPrincipal = {
    appUserId: 'user-it-1',
    employeeId: 'it-1',
    sessionId: 'sess-1',
    roles: ['IT_ADMIN'],
  } as unknown as AuthenticatedPrincipal;

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
          collectorInstalled: false,
          acknowledgedFrom: null,
          collectionStoppedAt: null,
          ...options.openRegistration,
        }
      : null;

    const voidDeviceMock = jest.fn().mockResolvedValue(undefined);
    const repo = {
      lockDevice: jest.fn().mockResolvedValue(device),
      lockOpenRegistration: jest.fn().mockResolvedValue(open),
      hasOpenReturnTask: jest.fn().mockResolvedValue(options.hasOpenReturnTask ?? false),
      readVoidHistory: jest.fn().mockResolvedValue({
        hasSignatureRecord: options.hasSignatureRecord ?? false,
        hasCredential: options.hasCredential ?? false,
      }),
      voidDevice: voidDeviceMock,
    } as unknown as RegistryRepo;

    const closeAllOfDevice = jest.fn().mockResolvedValue([]);
    const activations = {
      hasKeyActivationHistory: jest.fn().mockResolvedValue(options.hasKeyActivationHistory ?? false),
      closeAllOfDevice,
    } as unknown as LicensingDeviceActivationApi;

    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
    } as unknown as OrganizationReadApi;
    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const audit = { record: auditRecord } as unknown as AuditApi;
    const runner = {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;

    const service = new VoidService(repo, activations, organizationReads, audit, runner);

    return { service, mocks: { voidDeviceMock, closeAllOfDevice, auditRecord } };
  }

  const expectErrorCode = async (
    promise: Promise<unknown>,
    errorClass: new (...args: never[]) => Error,
    code: string,
    reason?: string,
  ) => {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(errorClass);
    const mapped = toLifecycleApiException(caught) as ApiException;
    const body = mapped.getResponse() as { code: string; details?: { reason?: string } };
    expect(body.code).toBe(code);
    if (reason !== undefined) expect(body.details?.reason).toBe(reason);
  };

  it('voids an untouched in-stock machine, closes bundled activations with DEVICE_VOIDED, and audits DEVICE.VOIDED', async () => {
    const { service, mocks } = setup();

    await service.voidDevice(actor, 'dev-1', 'Entered twice by mistake', now);

    expect(mocks.closeAllOfDevice).toHaveBeenCalledWith(tx, {
      deviceId: 'dev-1',
      cause: 'DEVICE_VOIDED',
      decisions: [],
      on: '2026-11-24',
      at: now,
      by: {
        kind: 'USER',
        appUserId: 'user-it-1',
        employeeId: 'it-1',
        sessionId: 'sess-1',
      },
    });
    expect(mocks.voidDeviceMock).toHaveBeenCalledWith(tx, 'dev-1', {
      voidedAt: now,
      voidReason: 'Entered twice by mistake',
      voidedByAppUserId: 'user-it-1',
    });
    expect(mocks.auditRecord).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'DEVICE.VOIDED',
        resourceId: 'dev-1',
        after: { reason: 'Entered twice by mistake' },
      }),
    );
  });

  it('rejects missing, already voided, retired, or history-blocked devices with exact error codes and reasons', async () => {
    await expectErrorCode(
      setup({ device: null }).service.voidDevice(actor, 'dev-1', 'x', now),
      DeviceNotFoundError,
      'DEVICE.NOT_FOUND',
    );
    await expectErrorCode(
      setup({ device: { voidedAt: now } }).service.voidDevice(actor, 'dev-1', 'x', now),
      DeviceVoidedError,
      'DEVICE.VOIDED',
    );
    await expectErrorCode(
      setup({ device: { retiredAt: now } }).service.voidDevice(actor, 'dev-1', 'x', now),
      DeviceAlreadyRetiredError,
      'DEVICE.ALREADY_RETIRED',
    );
    await expectErrorCode(
      setup({ hasOpenReturnTask: true }).service.voidDevice(actor, 'dev-1', 'x', now),
      DeviceVoidRefusedError,
      'DEVICE.VOID_REFUSED',
      'AWAITING_RETURN',
    );
    await expectErrorCode(
      setup({ openRegistration: { holderEmployeeId: 'emp-1' } }).service.voidDevice(actor, 'dev-1', 'x', now),
      DeviceVoidRefusedError,
      'DEVICE.VOID_REFUSED',
      'HELD',
    );
    await expectErrorCode(
      setup({ hasSignatureRecord: true }).service.voidDevice(actor, 'dev-1', 'x', now),
      DeviceVoidRefusedError,
      'DEVICE.VOID_REFUSED',
      'SIGNATURE_RECORDED',
    );
    await expectErrorCode(
      setup({ hasCredential: true }).service.voidDevice(actor, 'dev-1', 'x', now),
      DeviceVoidRefusedError,
      'DEVICE.VOID_REFUSED',
      'CREDENTIAL_ISSUED',
    );
    await expectErrorCode(
      setup({ hasKeyActivationHistory: true }).service.voidDevice(actor, 'dev-1', 'x', now),
      DeviceVoidRefusedError,
      'DEVICE.VOID_REFUSED',
      'KEY_ACTIVATION',
    );
  });
});
