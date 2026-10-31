import { Test } from '@nestjs/testing';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ProvisioningAnotherItAdminNeededError } from '../public/licensing.errors';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

const ORGANIZATION = { id: 'org-1' };

const itAdmin = (employeeId: string): AuthenticatedPrincipal => ({
  subject: 'app-user-it',
  appUserId: 'app-user-it',
  sessionId: 'session-it',
  employeeId,
  directRoles: ['IT_ADMIN'],
  derivedRoles: [],
  roles: ['IT_ADMIN'],
});

/**
 * `SoD-5` (`QĐ-77m`): an IT Admin who is the beneficiary of a task works it only when no other usable IT Admin can; the others are
 * counted in the transaction of the act, the act is audited as self-executed and the Super Admin is told in that same transaction.
 *
 * This unit spec establishes what the frame does with the transaction it is given, and nothing about two transactions at once: whether
 * an account that becomes usable between the count and the commit is seen is a property of PostgreSQL (`READ COMMITTED`, no row lock on
 * the count), which a real-database barrier test would show and which is deferred by the Owner's test policy.
 */
describe('ProvisioningTaskFrame.work', () => {
  const tx = { name: 'tx' } as unknown as DbTx;
  const repo = { lock: jest.fn(), find: jest.fn() };
  const organization = { getOrganization: jest.fn() };
  const identity = { countUsableItAdminsExcept: jest.fn(), findUsableSuperAdminEmployeeId: jest.fn() };
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
        { provide: OrganizationReadApi, useValue: organization },
        { provide: IdentityAccessApi, useValue: identity },
        { provide: NotificationsApi, useValue: notifications },
        { provide: AuditApi, useValue: audit },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();
    frame = module.get(ProvisioningTaskFrame);
  });

  it('lets an IT Admin work their own task when no other usable IT Admin can: counted in the transaction, audited as self-executed, the Super Admin told after the write in it', async () => {
    repo.lock.mockResolvedValue(task('e-it1'));
    identity.countUsableItAdminsExcept.mockResolvedValue(0);

    await frame.work(itAdmin('e-it1'), 'task-1', action);

    expect(identity.countUsableItAdminsExcept).toHaveBeenCalledWith('e-it1', tx);
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

  it('refuses an IT Admin their own task while another usable IT Admin can work it, and writes, audits and tells nobody', async () => {
    repo.lock.mockResolvedValue(task('e-it1'));
    identity.countUsableItAdminsExcept.mockResolvedValue(1);

    await expect(frame.work(itAdmin('e-it1'), 'task-1', action)).rejects.toBeInstanceOf(
      ProvisioningAnotherItAdminNeededError,
    );

    expect(write).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });

  it('does not count the other IT Admins, mark the act or tell anybody for a task of somebody else', async () => {
    repo.lock.mockResolvedValue(task('e-employee'));

    await frame.work(itAdmin('e-it1'), 'task-1', action);

    expect(identity.countUsableItAdminsExcept).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ after: expect.objectContaining({ selfExecuted: false }) as unknown }),
    );
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });

  it('still marks the act when no Super Admin can be told, and tells nobody', async () => {
    repo.lock.mockResolvedValue(task('e-it1'));
    identity.countUsableItAdminsExcept.mockResolvedValue(0);
    identity.findUsableSuperAdminEmployeeId.mockResolvedValue(null);

    await frame.work(itAdmin('e-it1'), 'task-1', action);

    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ after: expect.objectContaining({ selfExecuted: true }) as unknown }),
    );
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });
});
