import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import type { RegistrationEndService } from '../registry/registration-end.service';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import type { DeviceRecord, RegistrationRecord, RegistryRepo } from '../registry/registry.repo';
import { DeviceAwaitingReturnError, DeviceVoidedError } from './lifecycle.errors';
import { toLifecycleApiException } from './lifecycle.http-errors';
import { RetirementService } from './retirement.service';

interface SetupOptions {
  device?: Partial<DeviceRecord> | null;
  openRegistration?: Partial<RegistrationRecord> | null;
  hasOpenReturnTask?: boolean;
  inCharge?: string | null;
  substitute?: string | null;
  closedActivations?: Array<{ id: string; licenseReleased: boolean | null }>;
}

describe('RetirementService', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const actor = (employeeId = 'it-1'): AuthenticatedPrincipal =>
    ({
      appUserId: `user-${employeeId}`,
      employeeId,
      sessionId: `sess-${employeeId}`,
      roles: ['IT_ADMIN'],
    }) as unknown as AuthenticatedPrincipal;

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
      hasOpenReturnTask: jest.fn().mockResolvedValue(options.hasOpenReturnTask ?? false),
      retireDevice: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegistryRepo;
    const ending = { end: jest.fn().mockResolvedValue(undefined) } as unknown as RegistrationEndService;
    const activations = {
      closeAllOfDevice: jest.fn().mockResolvedValue(options.closedActivations ?? []),
    } as unknown as LicensingDeviceActivationApi;
    const actors = [options.inCharge === undefined ? 'it-1' : options.inCharge, options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
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
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
    const runner = {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;

    const service = new RetirementService(repo, ending, activations, organizationReads, identity, audit, runner);

    return { service, repo, ending, activations, audit };
  }

  const firstAuditAfter = (audit: AuditApi): Record<string, unknown> => {
    const calls = (audit.record as jest.Mock).mock.calls as Array<[unknown, { after: Record<string, unknown> }]>;
    return calls[0][1].after;
  };

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

  it('allows any IT Admin to retire an IN_STOCK machine as DISPOSED by default and closes activations', async () => {
    const { service, repo, ending, activations, audit } = setup({
      closedActivations: [{ id: 'act-1', licenseReleased: true }],
    });

    await service.retire(actor('it-other'), 'dev-1', { reason: 'Disk failed' }, now);

    expect((ending as unknown as { end: jest.Mock }).end).not.toHaveBeenCalled();
    expect((activations as unknown as { closeAllOfDevice: jest.Mock }).closeAllOfDevice).toHaveBeenCalledWith(tx, {
      deviceId: 'dev-1',
      cause: 'DEVICE_DISPOSED',
      decisions: [],
      on: '2026-11-24',
      at: now,
      by: {
        kind: 'USER',
        appUserId: 'user-it-other',
        employeeId: 'it-other',
        sessionId: 'sess-it-other',
        bySubstitute: false,
      },
    });
    expect((repo as unknown as { retireDevice: jest.Mock }).retireDevice).toHaveBeenCalledWith(
      tx,
      'dev-1',
      now,
      'Disk failed',
      'DISPOSED',
    );
    expect(firstAuditAfter(audit)).toEqual({
      reason: 'Disk failed',
      retirementKind: 'DISPOSED',
      endedRegistrationId: null,
      activationDecisions: [{ activationId: 'act-1', licenseReleased: true }],
    });
  });

  it('supports LOST retirementKind with activationDecisions and enforces acting IT Admin when held', async () => {
    const denied = setup({ openRegistration: { holderEmployeeId: 'emp-1' }, inCharge: 'it-1' });
    await expectErrorCode(
      denied.service.retire(actor('it-other'), 'dev-1', { reason: 'Lost' }, now),
      DeviceNotInChargeError,
      'DEVICE.NOT_IN_CHARGE',
    );

    const bySub = setup({
      openRegistration: { holderEmployeeId: 'emp-1' },
      inCharge: 'it-1',
      substitute: 'it-sub',
      closedActivations: [{ id: 'act-key-1', licenseReleased: false }],
    });
    await bySub.service.retire(
      actor('it-sub'),
      'dev-1',
      {
        retirementKind: 'LOST',
        reason: 'Stolen in transit',
        activationDecisions: [{ activationId: 'act-key-1', licenseRelease: 'LOST_WITH_DEVICE' }],
      },
      now,
    );

    expect((bySub.ending as unknown as { end: jest.Mock }).end).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'reg-1' }),
      { at: now, cause: 'DEVICE_RETIRED' },
      expect.anything(),
    );
    const closeMock = (bySub.activations as unknown as { closeAllOfDevice: jest.Mock }).closeAllOfDevice;
    expect(closeMock).toHaveBeenCalledTimes(1);
    const closeInput = (closeMock.mock.calls as Array<[unknown, Record<string, unknown>]>)[0][1];
    expect(closeInput).toMatchObject({
      deviceId: 'dev-1',
      cause: 'DEVICE_LOST',
      decisions: [{ activationId: 'act-key-1', licenseRelease: 'LOST_WITH_DEVICE' }],
    });
    expect(closeInput.by).toMatchObject({ bySubstitute: true });
    expect((bySub.repo as unknown as { retireDevice: jest.Mock }).retireDevice).toHaveBeenCalledWith(
      tx,
      'dev-1',
      now,
      'Stolen in transit',
      'LOST',
    );
    expect(firstAuditAfter(bySub.audit)).toEqual({
      reason: 'Stolen in transit',
      retirementKind: 'LOST',
      endedRegistrationId: 'reg-1',
      activationDecisions: [{ activationId: 'act-key-1', licenseReleased: false }],
      bySubstitute: true,
    });
  });

  it('rejects missing, voided, already retired, or awaiting-return devices with exact error codes', async () => {
    await expectErrorCode(
      setup({ device: null }).service.retire(actor(), 'dev-1', { reason: 'x' }, now),
      DeviceNotFoundError,
      'DEVICE.NOT_FOUND',
    );
    await expectErrorCode(
      setup({ device: { voidedAt: now } }).service.retire(actor(), 'dev-1', { reason: 'x' }, now),
      DeviceVoidedError,
      'DEVICE.VOIDED',
    );
    await expectErrorCode(
      setup({ device: { retiredAt: now } }).service.retire(actor(), 'dev-1', { reason: 'x' }, now),
      DeviceAlreadyRetiredError,
      'DEVICE.ALREADY_RETIRED',
    );
    await expectErrorCode(
      setup({ hasOpenReturnTask: true }).service.retire(actor(), 'dev-1', { reason: 'x' }, now),
      DeviceAwaitingReturnError,
      'DEVICE.AWAITING_RETURN',
    );
  });
});
