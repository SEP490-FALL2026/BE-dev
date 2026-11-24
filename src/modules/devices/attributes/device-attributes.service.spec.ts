import { HttpException, HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotInChargeError } from '../public/devices.errors';
import { DeviceNotEditableError, DeviceSerialNumberTakenError } from './device-attributes.errors';
import { toDeviceAttributesApiException } from './device-attributes.http-errors';
import type { DeviceAttributesRepo, DeviceRow } from './device-attributes.repo';
import { DeviceAttributesService } from './device-attributes.service';

describe('DeviceAttributesService acting IT Admin checks and HTTP error mapping', () => {
  const tx = {};
  const now = new Date('2026-11-24T10:00:00.000Z');
  const updatedAt = new Date('2026-11-24T09:00:00.000Z');
  const nextUpdatedAt = new Date('2026-11-24T10:00:00.000Z');
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;

  const baseRow = (over: Partial<DeviceRow> = {}): DeviceRow => ({
    id: 'dev-1',
    assetCode: 'LAP-26-0001',
    hostname: 'DES-01',
    os: 'Windows 11',
    serialNumber: null,
    deviceType: 'LAP',
    retiredAt: null,
    voidedAt: null,
    updatedAt,
    ...over,
  });

  function setup(options: {
    hasOpenReturnTask?: boolean;
    openReturnTaskDepartmentId?: string | null;
    openRegistrationHolderId?: string | null;
    workDepartmentId?: string | null;
    inCharge?: string | null;
    substitute?: string | null;
  }) {
    const row = baseRow();
    const updatedRow = baseRow({ hostname: 'DES-02', updatedAt: nextUpdatedAt });
    const repo = {
      lock: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(updatedRow),
      findCustodyContext: jest.fn().mockResolvedValue({
        hasOpenReturnTask: options.hasOpenReturnTask ?? false,
        openReturnTaskDepartmentId: options.openReturnTaskDepartmentId ?? null,
        openRegistrationHolderId: options.openRegistrationHolderId ?? null,
      }),
    } as unknown as DeviceAttributesRepo;

    const actingActors = [options.inCharge ?? null, options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );
    const actingMap = new Map(
      actingActors.length > 0 || options.inCharge !== undefined || options.substitute !== undefined
        ? [
            [
              options.openReturnTaskDepartmentId ?? options.workDepartmentId ?? 'dept-1',
              {
                inCharge: options.inCharge ?? null,
                substitute: options.substitute ?? null,
                actors: actingActors,
              },
            ],
          ]
        : [],
    );

    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
      workDepartmentsOf: jest
        .fn()
        .mockResolvedValue(
          options.workDepartmentId
            ? new Map([[options.openRegistrationHolderId ?? 'emp-h', options.workDepartmentId]])
            : new Map(),
        ),
      itAdminsActingFor: jest.fn().mockResolvedValue(actingMap),
    } as unknown as OrganizationReadApi;

    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actingActors)),
    } as unknown as IdentityAccessApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;

    const service = new DeviceAttributesService(repo, organizationReads, audit, runner, identity);

    return { service, repo, audit };
  }

  const actor = (employeeId: string) =>
    ({ appUserId: `user-${employeeId}`, employeeId, roles: ['IT_ADMIN'] }) as unknown as AuthenticatedPrincipal;

  const firstAuditAfter = (audit: AuditApi): Record<string, unknown> => {
    const calls = (audit.record as jest.Mock).mock.calls as Array<[unknown, { after: Record<string, unknown> }]>;
    return calls[0][1].after;
  };

  it('allows any IT Admin to update attributes of an in-stock device', async () => {
    const { service, audit, repo } = setup({});

    const view = await service.change(
      actor('it-any'),
      'dev-1',
      { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
      now,
    );

    expect(view.hostname).toBe('DES-02');
    expect((repo as unknown as { update: jest.Mock }).update).toHaveBeenCalledTimes(1);
    expect(firstAuditAfter(audit)).toEqual({ hostname: 'DES-02' });
  });

  it('allows only the in-charge or appointed substitute IT Admin for an assigned device and records bySubstitute', async () => {
    const withInCharge = setup({
      openRegistrationHolderId: 'emp-1',
      workDepartmentId: 'dept-1',
      inCharge: 'it-1',
      substitute: 'it-sub',
    });
    await withInCharge.service.change(
      actor('it-1'),
      'dev-1',
      { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
      now,
    );
    expect(firstAuditAfter(withInCharge.audit)).toEqual({ hostname: 'DES-02' });

    const withSub = setup({
      openRegistrationHolderId: 'emp-1',
      workDepartmentId: 'dept-1',
      inCharge: 'it-1',
      substitute: 'it-sub',
    });
    await withSub.service.change(actor('it-sub'), 'dev-1', { expectedUpdatedAt: updatedAt, hostname: 'DES-02' }, now);
    expect(firstAuditAfter(withSub.audit)).toEqual({
      hostname: 'DES-02',
      bySubstitute: true,
    });

    const other = setup({
      openRegistrationHolderId: 'emp-1',
      workDepartmentId: 'dept-1',
      inCharge: 'it-1',
      substitute: 'it-sub',
    });
    await expect(
      other.service.change(actor('it-other'), 'dev-1', { expectedUpdatedAt: updatedAt, hostname: 'DES-02' }, now),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);
    expect((other.repo as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('rejects any IT Admin when the assigned holder has never been placed in a department, and uses return-task department for AWAITING_RETURN', async () => {
    const unplaced = setup({ openRegistrationHolderId: 'emp-unplaced', workDepartmentId: null });
    await expect(
      unplaced.service.change(actor('it-1'), 'dev-1', { expectedUpdatedAt: updatedAt, hostname: 'DES-02' }, now),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const awaitingReturn = setup({
      hasOpenReturnTask: true,
      openReturnTaskDepartmentId: 'dept-return',
      inCharge: 'it-ret',
      substitute: null,
    });
    await expect(
      awaitingReturn.service.change(
        actor('it-other'),
        'dev-1',
        { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);
    await expect(
      awaitingReturn.service.change(
        actor('it-ret'),
        'dev-1',
        { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
        now,
      ),
    ).resolves.toMatchObject({ hostname: 'DES-02' });
  });

  it('maps PATCH /devices/{id} errors to the SPEC HTTP statuses and error codes', () => {
    const check = (err: Error, status: number, code: string) => {
      const mapped = toDeviceAttributesApiException(err) as HttpException;
      expect(mapped).toBeInstanceOf(HttpException);
      expect(mapped.getStatus()).toBe(status);
      expect(mapped.getResponse()).toMatchObject({ code });
    };

    check(new DeviceNotInChargeError(), HttpStatus.FORBIDDEN, 'DEVICE.NOT_IN_CHARGE');
    check(new DeviceNotEditableError('VOIDED'), HttpStatus.CONFLICT, 'DEVICE.VOIDED');
    check(new DeviceNotEditableError('RETIRED'), HttpStatus.CONFLICT, 'DEVICE.ALREADY_RETIRED');
    check(new DeviceSerialNumberTakenError(), HttpStatus.CONFLICT, 'DEVICE.SERIAL_TAKEN');
  });
});
