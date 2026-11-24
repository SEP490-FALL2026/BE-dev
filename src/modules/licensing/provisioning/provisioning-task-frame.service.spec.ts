import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { ProvisioningPlanBoundToDeviceError, ProvisioningTaskNotFoundError } from '../public/licensing.errors';
import { toLicensingApiException } from '../licensing.http-errors';
import { ProvisioningNotInChargeError } from './provisioning.errors';
import { toProvisioningApiException } from './provisioning.http-errors';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

const ORGANIZATION = { id: 'org-1' };

const itAdmin = (employeeId: string): AuthenticatedPrincipal => ({
  subject: 'app-user-it',
  appUserId: 'app-user-it',
  sessionId: 'session-it',
  employeeId,
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
});

describe('ProvisioningTaskFrame.work', () => {
  const tx = { name: 'tx' } as unknown as DbTx;
  const repo = { lock: jest.fn(), find: jest.fn() };
  const organization = {
    getOrganization: jest.fn(),
    businessToday: jest.fn(),
    workDepartmentsOf: jest.fn(),
    notStartedAmong: jest.fn().mockResolvedValue(new Set()),
    itAdminsActingFor: jest.fn(),
    itAdminsActingForUnplacedWork: jest.fn(),
  };
  const organizationWrites = { endUnplacedWorkDesignations: jest.fn() };
  const identity = { findUsableItAdminEmployeeIds: jest.fn(), findUsableSuperAdminEmployeeId: jest.fn() };
  const notifications = { notifyInApp: jest.fn() };
  const audit = { record: jest.fn() };
  const runner = { run: jest.fn() };
  const write = jest.fn();

  let frame: ProvisioningTaskFrame;
  const order: string[] = [];

  const task = (beneficiaryEmployeeId: string) => ({
    id: 'task-1',
    status: 'QUEUED',
    claimedByAppUserId: null,
    attempts: 0,
    defaultResponsibleEmployeeId: 'e-it1',
    assignment: { employeeId: beneficiaryEmployeeId },
  });
  const action = { check: jest.fn(), write };

  beforeEach(async () => {
    jest.resetAllMocks();
    order.length = 0;
    runner.run.mockImplementation((fn: (client: DbTx) => Promise<unknown>) => fn(tx));
    organization.getOrganization.mockResolvedValue(ORGANIZATION);
    organization.businessToday.mockResolvedValue('2026-11-23');
    organization.notStartedAmong.mockResolvedValue(new Set());
    organization.workDepartmentsOf.mockResolvedValue(
      new Map([
        ['e-employee', 'dept-1'],
        ['e-it1', 'dept-1'],
      ]),
    );
    organization.itAdminsActingFor.mockResolvedValue(
      new Map([['dept-1', { inCharge: 'e-it1', substitute: null, defaultAssignee: 'e-it1', actors: ['e-it1'] }]]),
    );
    organization.itAdminsActingForUnplacedWork.mockResolvedValue(new Map());
    organizationWrites.endUnplacedWorkDesignations.mockResolvedValue(0);
    repo.find.mockResolvedValue(null);
    identity.findUsableSuperAdminEmployeeId.mockResolvedValue('e-super');
    write.mockImplementation(() => {
      order.push('write');

      return Promise.resolve({ action: 'CLAIMED', after: { status: 'IN_PROGRESS' } });
    });
    audit.record.mockImplementation(() => {
      order.push('audit');

      return Promise.resolve();
    });
    notifications.notifyInApp.mockImplementation(() => {
      order.push('notify');

      return Promise.resolve();
    });

    const module = await Test.createTestingModule({
      providers: [
        ProvisioningTaskFrame,
        { provide: ProvisioningTaskRepo, useValue: repo },
        { provide: OrganizationApi, useValue: organizationWrites },
        { provide: OrganizationReadApi, useValue: organization },
        { provide: IdentityAccessApi, useValue: identity },
        { provide: NotificationsApi, useValue: notifications },
        { provide: AuditApi, useValue: audit },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();
    frame = module.get(ProvisioningTaskFrame);
  });

  it('rejects an IT Admin outside acting IT Admins for the beneficiary work department with ProvisioningNotInChargeError', async () => {
    repo.lock.mockResolvedValue(task('e-employee'));

    await expect(frame.work(itAdmin('e-other'), 'task-1', action)).rejects.toBeInstanceOf(ProvisioningNotInChargeError);

    expect(organization.workDepartmentsOf).toHaveBeenCalledWith(['e-employee'], '2026-11-23', tx);
    expect(organization.itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function), tx);
    expect(action.check).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects when the beneficiary has no work department (unplaced) and no designation, and writes nothing', async () => {
    repo.lock.mockResolvedValue(task('e-unplaced'));

    await expect(frame.work(itAdmin('e-it1'), 'task-1', action)).rejects.toBeInstanceOf(ProvisioningNotInChargeError);

    expect(organization.itAdminsActingFor).not.toHaveBeenCalled();
    expect(organization.itAdminsActingForUnplacedWork).toHaveBeenCalledWith(
      [{ workKind: 'PROVISIONING_TASK', workId: 'task-1', employeeId: 'e-unplaced' }],
      expect.any(Function),
      tx,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('allows the designated IT Admin on an unplaced task with bySubstitute: true and closes designation when task completes', async () => {
    repo.lock.mockResolvedValue(task('e-unplaced'));
    organization.itAdminsActingForUnplacedWork.mockResolvedValue(
      new Map([[unplacedWorkKey('PROVISIONING_TASK', 'task-1'), 'e-des']]),
    );
    write.mockResolvedValueOnce({ action: 'REVOCATION_COMPLETED', after: { status: 'COMPLETED' } });

    await frame.work(itAdmin('e-des'), 'task-1', action);

    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'PROVISIONING_TASK.REVOCATION_COMPLETED',
        after: expect.objectContaining({ bySubstitute: true }) as unknown,
      }),
    );
    expect(organizationWrites.endUnplacedWorkDesignations).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        workKind: 'PROVISIONING_TASK',
        workId: 'task-1',
        endedByAppUserId: 'app-user-it',
      }),
    );
  });

  it('rejects non-designated IT Admin when an unplaced task is designated to another IT Admin', async () => {
    repo.lock.mockResolvedValue(task('e-unplaced'));
    organization.itAdminsActingForUnplacedWork.mockResolvedValue(
      new Map([[unplacedWorkKey('PROVISIONING_TASK', 'task-1'), 'e-des']]),
    );

    await expect(frame.work(itAdmin('e-other'), 'task-1', action)).rejects.toBeInstanceOf(ProvisioningNotInChargeError);
    expect(write).not.toHaveBeenCalled();
  });

  it('does not close unplaced designations when the action does not close the task', async () => {
    repo.lock.mockResolvedValue(task('e-employee'));

    await frame.work(itAdmin('e-it1'), 'task-1', action);

    expect(organizationWrites.endUnplacedWorkDesignations).not.toHaveBeenCalled();
  });

  it('records bySubstitute: true in audit after when an appointed substitute acts on the task', async () => {
    repo.lock.mockResolvedValue(task('e-employee'));
    organization.itAdminsActingFor.mockResolvedValue(
      new Map([
        ['dept-1', { inCharge: 'e-it1', substitute: 'e-sub', defaultAssignee: 'e-sub', actors: ['e-it1', 'e-sub'] }],
      ]),
    );

    await frame.work(itAdmin('e-sub'), 'task-1', action);

    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'PROVISIONING_TASK.CLAIMED',
        after: expect.objectContaining({ selfExecuted: false, bySubstitute: true }) as unknown,
      }),
    );
  });

  it('allows an acting IT Admin to work their own task without blocker, records selfExecuted and notifies Super Admin', async () => {
    repo.lock.mockResolvedValue(task('e-it1'));

    await frame.work(itAdmin('e-it1'), 'task-1', action);

    expect(identity.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(tx);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'PROVISIONING_TASK.CLAIMED',
        after: expect.objectContaining({ selfExecuted: true }) as unknown,
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientEmployeeId: 'e-super',
        code: 'IT_ADMIN_SELF_EXECUTED',
        eventKey: 'IT_ADMIN_SELF_EXECUTED:task-1',
      }),
    );
    expect(order).toEqual(['write', 'audit', 'notify']);
  });

  it('does not notify when no Super Admin can be told, and still marks selfExecuted', async () => {
    repo.lock.mockResolvedValue(task('e-it1'));
    identity.findUsableSuperAdminEmployeeId.mockResolvedValue(null);

    await frame.work(itAdmin('e-it1'), 'task-1', action);

    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ after: expect.objectContaining({ selfExecuted: true }) as unknown }),
    );
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });

  describe('what an action takes before the task', () => {
    it('reads the task without a lock and lets the action take what stands above it before the task is locked', async () => {
      repo.find.mockResolvedValue(task('e-employee'));
      repo.lock.mockImplementation(() => {
        order.push('lock-task');

        return Promise.resolve(task('e-employee'));
      });
      const beforeLock = jest.fn().mockImplementation(() => {
        order.push('before-lock');

        return Promise.resolve();
      });

      await frame.work(itAdmin('e-it1'), 'task-1', { ...action, beforeLock });

      expect(beforeLock).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'task-1' }));
      expect(order.slice(0, 3)).toEqual(['before-lock', 'lock-task', 'write']);
    });

    it('does not read the task beforehand when the action has nothing to take first', async () => {
      repo.lock.mockResolvedValue(task('e-employee'));
      repo.find.mockResolvedValue(task('e-employee'));

      await frame.work(itAdmin('e-it1'), 'task-1', action);

      expect(repo.find.mock.invocationCallOrder[0]).toBeGreaterThan(repo.lock.mock.invocationCallOrder[0]);
    });

    it('takes nothing for a task that is not there, and answers not found', async () => {
      repo.find.mockResolvedValue(null);
      repo.lock.mockResolvedValue(null);
      const beforeLock = jest.fn();

      await expect(frame.work(itAdmin('e-it1'), 'task-1', { ...action, beforeLock })).rejects.toBeInstanceOf(
        ProvisioningTaskNotFoundError,
      );

      expect(beforeLock).not.toHaveBeenCalled();
    });

    it('maps ProvisioningPlanBoundToDeviceError to 409 PROVISIONING.PLAN_BOUND_TO_DEVICE (W2-18, S-4)', () => {
      const mapped = toProvisioningApiException(new ProvisioningPlanBoundToDeviceError()) as ApiException;

      expect(mapped).toBeInstanceOf(ApiException);
      expect(mapped.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mapped.getResponse()).toMatchObject({ code: 'PROVISIONING.PLAN_BOUND_TO_DEVICE' });
    });

    it('rejects a beneficiary with only a future placement with EmployeeNotStartedError before checking IT Admin charge', async () => {
      repo.lock.mockResolvedValue(task('e-future'));
      repo.find.mockResolvedValue(task('e-future'));
      organization.workDepartmentsOf.mockResolvedValue(new Map());
      organization.notStartedAmong.mockResolvedValue(new Set(['e-future']));

      await expect(frame.work(itAdmin('e-it1'), 'task-1', action)).rejects.toBeInstanceOf(EmployeeNotStartedError);
      expect(organization.notStartedAmong).toHaveBeenCalledWith(['e-future'], '2026-11-23', tx);
      expect(write).not.toHaveBeenCalled();
    });

    it('maps EmployeeNotStartedError to 409 EMPLOYEE.NOT_STARTED in provisioning and licensing mappers', () => {
      for (const mapper of [toProvisioningApiException, toLicensingApiException]) {
        const mapped = mapper(new EmployeeNotStartedError('e-future')) as ApiException;

        expect(mapped).toBeInstanceOf(ApiException);
        expect(mapped.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(mapped.getResponse()).toMatchObject({ code: 'EMPLOYEE.NOT_STARTED' });
      }
    });
  });
});
