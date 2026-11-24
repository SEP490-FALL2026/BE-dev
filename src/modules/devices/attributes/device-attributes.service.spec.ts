import { HttpException, HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey, type UnplacedWorkKind } from '../../organization/public/organization.types';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
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
    openReturnTaskId?: string | null;
    openReturnTaskEmployeeId?: string | null;
    openRegistrationHolderId?: string | null;
    notStarted?: string[];
    designated?: { kind: UnplacedWorkKind; workId: string; employeeId: string };
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
        openReturnTaskId: options.openReturnTaskId ?? null,
        openReturnTaskEmployeeId: options.openReturnTaskEmployeeId ?? null,
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

    const unplacedReads = jest
      .fn()
      .mockResolvedValue(
        options.designated
          ? new Map([
              [unplacedWorkKey(options.designated.kind, options.designated.workId), options.designated.employeeId],
            ])
          : new Map(),
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
      notStartedAmong: jest.fn().mockResolvedValue(new Set(options.notStarted ?? [])),
      itAdminsActingForUnplacedWork: unplacedReads,
    } as unknown as OrganizationReadApi;

    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actingActors)),
    } as unknown as IdentityAccessApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;

    const service = new DeviceAttributesService(repo, organizationReads, audit, runner, identity);

    return { service, repo, audit, unplacedReads };
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

  it('lets the IT Admin appointed for the device of an unplaced holder correct it (bySubstitute) and refuses every other IT Admin with DEVICE.NOT_IN_CHARGE', async () => {
    const options = {
      openRegistrationHolderId: 'emp-unplaced',
      workDepartmentId: null,
      designated: { kind: 'DEVICE' as const, workId: 'dev-1', employeeId: 'it-designee' },
    };
    const appointed = setup(options);
    await appointed.service.change(
      actor('it-designee'),
      'dev-1',
      { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
      now,
    );
    expect(firstAuditAfter(appointed.audit)).toEqual({ hostname: 'DES-02', bySubstitute: true });
    expect(appointed.unplacedReads).toHaveBeenCalledWith(
      [{ workKind: 'DEVICE', workId: 'dev-1', employeeId: 'emp-unplaced' }],
      expect.any(Function),
      tx,
    );

    const other = setup(options);
    const refused = other.service.change(
      actor('it-other'),
      'dev-1',
      { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
      now,
    );
    await expect(refused).rejects.toBeInstanceOf(DeviceNotInChargeError);
    expect(toDeviceAttributesApiException(await refused.catch((e: Error) => e))).toMatchObject({
      response: { code: 'DEVICE.NOT_IN_CHARGE' },
    });
    expect((other.repo as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('reads the appointment of the open return task, not of the device, when the machine awaits return from an unplaced person', async () => {
    const options = {
      hasOpenReturnTask: true,
      openReturnTaskDepartmentId: null,
      openReturnTaskId: 'task-1',
      openReturnTaskEmployeeId: 'emp-unplaced',
      designated: { kind: 'DEVICE_RETURN_TASK' as const, workId: 'task-1', employeeId: 'it-designee' },
    };
    const appointed = setup(options);
    await expect(
      appointed.service.change(
        actor('it-designee'),
        'dev-1',
        { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
        now,
      ),
    ).resolves.toMatchObject({ hostname: 'DES-02' });
    expect(appointed.unplacedReads).toHaveBeenCalledWith(
      [{ workKind: 'DEVICE_RETURN_TASK', workId: 'task-1', employeeId: 'emp-unplaced' }],
      expect.any(Function),
      tx,
    );

    const other = setup(options);
    const refused = other.service.change(
      actor('it-other'),
      'dev-1',
      { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
      now,
    );
    await expect(refused).rejects.toBeInstanceOf(DeviceNotInChargeError);
    expect(toDeviceAttributesApiException(await refused.catch((e: Error) => e))).toMatchObject({
      response: { code: 'DEVICE.NOT_IN_CHARGE' },
    });
  });

  it('refuses the appointment of the device when the machine awaits return (the return task decides)', async () => {
    const { service } = setup({
      hasOpenReturnTask: true,
      openReturnTaskDepartmentId: null,
      openReturnTaskId: 'task-1',
      openReturnTaskEmployeeId: 'emp-unplaced',
      designated: { kind: 'DEVICE', workId: 'dev-1', employeeId: 'it-designee' },
    });

    await expect(
      service.change(actor('it-designee'), 'dev-1', { expectedUpdatedAt: updatedAt, hostname: 'DES-02' }, now),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);
  });

  it('does not look for an appointment on a machine in stock, where any IT Admin may correct it', async () => {
    const { service, unplacedReads } = setup({});

    await service.change(actor('it-any'), 'dev-1', { expectedUpdatedAt: updatedAt, hostname: 'DES-02' }, now);

    expect(unplacedReads).not.toHaveBeenCalled();
  });

  it('answers 409 EMPLOYEE.NOT_STARTED, not 403, when the holder has only a future placement, even to the IT Admin appointed for the device', async () => {
    const { service, repo, unplacedReads } = setup({
      openRegistrationHolderId: 'emp-future',
      workDepartmentId: null,
      notStarted: ['emp-future'],
      designated: { kind: 'DEVICE', workId: 'dev-1', employeeId: 'it-designee' },
    });

    const refused = service.change(
      actor('it-designee'),
      'dev-1',
      { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
      now,
    );

    await expect(refused).rejects.toBeInstanceOf(EmployeeNotStartedError);
    expect(toDeviceAttributesApiException(await refused.catch((e: Error) => e))).toMatchObject({
      response: { code: 'EMPLOYEE.NOT_STARTED' },
    });
    expect(unplacedReads).not.toHaveBeenCalled();
    expect((repo as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('answers 409 EMPLOYEE.NOT_STARTED when the person of the open return task has only a future placement', async () => {
    const { service } = setup({
      hasOpenReturnTask: true,
      openReturnTaskDepartmentId: null,
      openReturnTaskId: 'task-1',
      openReturnTaskEmployeeId: 'emp-future',
      notStarted: ['emp-future'],
    });

    const refused = service.change(actor('it-any'), 'dev-1', { expectedUpdatedAt: updatedAt, hostname: 'DES-02' }, now);

    await expect(refused).rejects.toBeInstanceOf(EmployeeNotStartedError);
    expect(toDeviceAttributesApiException(await refused.catch((e: Error) => e))).toMatchObject({
      response: { code: 'EMPLOYEE.NOT_STARTED' },
    });
  });

  it('refuses with DEVICE.NOT_IN_CHARGE the IT Admin who is leaving, on the machine awaiting return of their own, even when they are in charge of the department', async () => {
    const leaving = setup({
      hasOpenReturnTask: true,
      openReturnTaskDepartmentId: 'dept-1',
      openReturnTaskId: 'task-1',
      openReturnTaskEmployeeId: 'it-leaving',
      inCharge: 'it-leaving',
      substitute: 'it-sub',
    });

    const refused = leaving.service.change(
      actor('it-leaving'),
      'dev-1',
      { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
      now,
    );

    await expect(refused).rejects.toBeInstanceOf(DeviceNotInChargeError);
    expect(toDeviceAttributesApiException(await refused.catch((e: Error) => e))).toMatchObject({
      response: { code: 'DEVICE.NOT_IN_CHARGE' },
    });
    expect((leaving.repo as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();

    const substitute = setup({
      hasOpenReturnTask: true,
      openReturnTaskDepartmentId: 'dept-1',
      openReturnTaskId: 'task-1',
      openReturnTaskEmployeeId: 'it-leaving',
      inCharge: 'it-leaving',
      substitute: 'it-sub',
    });
    await substitute.service.change(
      actor('it-sub'),
      'dev-1',
      { expectedUpdatedAt: updatedAt, hostname: 'DES-02' },
      now,
    );
    expect(firstAuditAfter(substitute.audit)).toEqual({ hostname: 'DES-02', bySubstitute: true });
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
