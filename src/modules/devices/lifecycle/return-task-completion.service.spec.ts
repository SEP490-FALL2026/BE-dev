import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import type { RegistryRepo } from '../registry/registry.repo';
import {
  DeviceReturnTaskAlreadyClosedError,
  DeviceReturnTaskNotFoundError,
  DeviceReturnTaskOutcomeFieldsInvalidError,
  DeviceReturnTaskSoftwareRemovalNoteRequiredError,
} from '../return-task/device-return-task.errors';
import { toDeviceReturnTaskApiException } from '../return-task/device-return-task.http-errors';
import type { DeviceReturnTaskRepo } from '../return-task/device-return-task.repo';
import type { ReturnTaskRecord } from '../return-task/device-return-task.types';
import type { DeviceReceiptService } from './device-receipt.service';
import { DeviceReturnTaskNotInChargeError } from './lifecycle.errors';
import type { RetirementService } from './retirement.service';
import { ReturnTaskCompletionService } from './return-task-completion.service';

const taskRow = (overrides: Partial<ReturnTaskRecord> = {}): ReturnTaskRecord => ({
  id: 'task-1',
  organizationId: 'org-1',
  deviceId: 'dev-1',
  registrationId: 'reg-1',
  employeeId: 'emp-1',
  offboardingCaseId: 'case-1',
  departmentId: 'dept-1',
  dueOn: '2026-11-25',
  state: 'OPEN',
  conditionOnReceipt: null,
  softwareRemoval: null,
  softwareRemovalNote: null,
  outcomeNote: null,
  handledByAppUserId: null,
  handledAt: null,
  overdueNoticedOn: null,
  createdAt: new Date('2026-11-20T00:00:00.000Z'),
  ...overrides,
});

const actor = (employeeId = 'it-1'): AuthenticatedPrincipal =>
  ({
    appUserId: `user-${employeeId}`,
    employeeId,
    sessionId: `sess-${employeeId}`,
    roles: ['IT_ADMIN'],
  }) as unknown as AuthenticatedPrincipal;

function setup(
  task: ReturnTaskRecord | null = taskRow(),
  options: {
    inCharge?: string | null;
    substitute?: string | null;
    unplacedDesignee?: string | null;
    notStartedIds?: string[];
  } = {},
) {
  const tx = {} as DbTx;
  const markReceived = jest.fn().mockResolvedValue(undefined);
  const markNotRecovered = jest.fn().mockResolvedValue(undefined);
  const returnTasks = {
    findById: jest.fn().mockResolvedValue(task),
    lockById: jest.fn().mockResolvedValue(task),
    markReceived,
    markNotRecovered,
  } as unknown as DeviceReturnTaskRepo;
  const registry = {
    lockDevice: jest.fn().mockResolvedValue({ id: 'dev-1' }),
    lockOpenRegistration: jest.fn().mockResolvedValue({ id: 'reg-1' }),
  } as unknown as RegistryRepo;
  const receive = jest.fn().mockResolvedValue(undefined);
  const receipts = { receive } as unknown as DeviceReceiptService;
  const retireInTx = jest.fn().mockResolvedValue(undefined);
  const retirements = { retireInTx } as unknown as RetirementService;

  const inCharge = options.inCharge === undefined ? 'it-1' : options.inCharge;
  const substitute = options.substitute ?? null;
  const actors = [inCharge, substitute].filter((id): id is string => id !== null);
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2026-11-25'),
    notStartedAmong: jest.fn().mockResolvedValue(new Set(options.notStartedIds ?? [])),
    itAdminsActingFor: jest.fn().mockResolvedValue(new Map([['dept-1', { inCharge, substitute, actors }]])),
    itAdminsActingForUnplacedWork: jest
      .fn()
      .mockResolvedValue(
        task && options.unplacedDesignee !== undefined
          ? new Map([[unplacedWorkKey('DEVICE_RETURN_TASK', task.id), options.unplacedDesignee]])
          : new Map(),
      ),
  } as unknown as OrganizationReadApi;
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actors)),
  } as unknown as IdentityAccessApi;
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const audit = { record: auditRecord } as unknown as AuditApi;
  const runner = {
    run: jest.fn().mockImplementation((work: (t: DbTx) => Promise<unknown>) => work(tx)),
  } as unknown as TransactionRunner;

  const service = new ReturnTaskCompletionService(
    returnTasks,
    registry,
    receipts,
    retirements,
    organizationReads,
    identity,
    audit,
    runner,
  );

  return { service, tx, markReceived, markNotRecovered, receive, retireInTx, auditRecord };
}

describe('ReturnTaskCompletionService', () => {
  it('completes RECEIVED as substitute, receives device into stock, and records bySubstitute in audit', async () => {
    const { service, tx, markReceived, receive, auditRecord } = setup(taskRow(), {
      inCharge: 'it-1',
      substitute: 'it-sub',
    });
    const now = new Date('2026-11-25T10:00:00.000Z');

    await service.complete(
      actor('it-sub'),
      'task-1',
      {
        outcome: 'RECEIVED',
        condition: 'USABLE',
        conditionNote: 'Clean',
        softwareRemoval: { outcome: 'REMOVED' },
      },
      now,
    );

    expect(markReceived).toHaveBeenCalledWith(tx, 'task-1', {
      conditionOnReceipt: 'USABLE',
      softwareRemoval: 'REMOVED',
      softwareRemovalNote: null,
      handledByAppUserId: 'user-it-sub',
      handledAt: now,
    });
    expect(receive).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ deviceId: 'dev-1', returnTaskId: 'task-1', bySubstitute: true }),
    );
    const calls = auditRecord.mock.calls as Array<[unknown, { action: string; after: Record<string, unknown> }]>;
    expect(calls[0]?.[1].action).toBe('DEVICE_RETURN_TASK.COMPLETED');
    expect(calls[0]?.[1].after).toEqual(expect.objectContaining({ outcome: 'RECEIVED', bySubstitute: true }));
  });

  it('completes NOT_RECOVERED by marking task and retiring device with LOST kind', async () => {
    const { service, tx, markNotRecovered, retireInTx } = setup();
    const now = new Date('2026-11-25T10:00:00.000Z');

    await service.complete(
      actor('it-1'),
      'task-1',
      {
        outcome: 'NOT_RECOVERED',
        reason: 'Lost by departed staff',
        activationDecisions: [{ activationId: 'act-1', licenseRelease: 'LOST_WITH_DEVICE' }],
      },
      now,
    );

    expect(markNotRecovered).toHaveBeenCalledWith(tx, 'task-1', {
      outcomeNote: 'Lost by departed staff',
      handledByAppUserId: 'user-it-1',
      handledAt: now,
    });
    expect(retireInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ employeeId: 'it-1' }),
      'org-1',
      'dev-1',
      {
        retirementKind: 'LOST',
        reason: 'Lost by departed staff',
        activationDecisions: [{ activationId: 'act-1', licenseRelease: 'LOST_WITH_DEVICE' }],
      },
      now,
      { preAuthorized: { open: { id: 'reg-1' }, today: '2026-11-25', bySubstitute: false }, returnTaskId: 'task-1' },
    );
  });

  it('rejects invalid outcome fields, closed tasks, missing tasks, and non-acting or self IT Admins', async () => {
    await expect(
      setup().service.complete(actor(), 'task-1', { outcome: 'RECEIVED', reason: 'should not be sent' }),
    ).rejects.toMatchObject({ code: 'DEVICE_RETURN_TASK.OUTCOME_FIELDS_INVALID' });

    await expect(
      setup().service.complete(actor(), 'task-1', {
        outcome: 'RECEIVED',
        condition: 'USABLE',
        softwareRemoval: { outcome: 'NOT_REMOVABLE' },
      }),
    ).rejects.toBeInstanceOf(DeviceReturnTaskSoftwareRemovalNoteRequiredError);

    await expect(
      setup(null).service.complete(actor(), 'task-1', { outcome: 'NOT_RECOVERED', reason: 'Missing' }),
    ).rejects.toBeInstanceOf(DeviceReturnTaskNotFoundError);

    await expect(
      setup(taskRow({ state: 'CANCELLED' })).service.complete(actor(), 'task-1', {
        outcome: 'NOT_RECOVERED',
        reason: 'Too late',
      }),
    ).rejects.toBeInstanceOf(DeviceReturnTaskAlreadyClosedError);

    await expect(
      setup(taskRow({ employeeId: 'it-1' }), { inCharge: 'it-1' }).service.complete(actor('it-1'), 'task-1', {
        outcome: 'NOT_RECOVERED',
        reason: 'Own task',
      }),
    ).rejects.toBeInstanceOf(DeviceReturnTaskNotInChargeError);

    await expect(
      setup(taskRow(), { inCharge: 'it-1' }).service.complete(actor('it-other'), 'task-1', {
        outcome: 'NOT_RECOVERED',
        reason: 'Not in charge',
      }),
    ).rejects.toBeInstanceOf(DeviceReturnTaskNotInChargeError);

    await expect(
      setup().service.complete(actor(), 'task-1', { outcome: 'NOT_RECOVERED', condition: 'USABLE', reason: 'bad' }),
    ).rejects.toBeInstanceOf(DeviceReturnTaskOutcomeFieldsInvalidError);
  });

  it('allows designated IT Admin on an unplaced return task with bySubstitute: true, rejects others, and closes designations', async () => {
    const now = new Date('2026-11-25T10:00:00.000Z');
    const unplaced = taskRow({ departmentId: null });
    const ok = setup(unplaced, { unplacedDesignee: 'it-des' });

    await ok.service.complete(
      actor('it-des'),
      'task-1',
      { outcome: 'RECEIVED', condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
      now,
    );

    expect(ok.receive).toHaveBeenCalledWith(
      ok.tx,
      expect.objectContaining({ returnTaskId: 'task-1', bySubstitute: true }),
    );

    const other = setup(unplaced, { unplacedDesignee: 'it-des' });
    await expect(
      other.service.complete(
        actor('it-other'),
        'task-1',
        { outcome: 'RECEIVED', condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceReturnTaskNotInChargeError);
  });

  it('rejects completing a return task for a future-placed employee with EmployeeNotStartedError (409 EMPLOYEE.NOT_STARTED)', async () => {
    const now = new Date('2026-11-25T10:00:00.000Z');
    const unplaced = taskRow({ departmentId: null, employeeId: 'emp-future' });
    const future = setup(unplaced, { notStartedIds: ['emp-future'] });
    const err = await future.service
      .complete(
        actor('it-1'),
        'task-1',
        { outcome: 'RECEIVED', condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
        now,
      )
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmployeeNotStartedError);
    const mapped = toDeviceReturnTaskApiException(err) as ApiException;
    expect(mapped.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(mapped.getResponse()).toMatchObject({ code: 'EMPLOYEE.NOT_STARTED' });
  });
});
