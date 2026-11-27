import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { ProvisioningTaskNotFoundError } from '../../public/licensing.errors';
import { unplacedWorkKey } from '../../../organization/public/organization.types';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import { ProvisioningService } from './provisioning.service';

const ACTOR: AuthenticatedPrincipal = {
  subject: 'app-it',
  appUserId: 'app-it',
  sessionId: 'session-it',
  employeeId: 'e-it',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};
const tx = { name: 'tx' } as unknown as DbTx;

type Action = {
  beforeLock: ((tx: DbTx, task: ProvisioningTaskRecord) => Promise<void>) | null;
};

function claimWith(holders: { holdBeneficiaryOfTask: jest.Mock; requireCanBeginTask: jest.Mock }) {
  let captured: Action | undefined;
  const frame = {
    work: jest.fn((_actor: unknown, _id: string, action: Action) => {
      captured = action;

      return Promise.resolve({ id: 't-1' });
    }),
  };
  const views = { views: jest.fn().mockResolvedValue([{ id: 't-1' }]) };
  const service = new ProvisioningService(
    {} as never,
    frame as never,
    views as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    holders as never,
  );

  return service.claim(ACTOR, 't-1').then(() => captured as Action);
}

describe('ProvisioningService.claim: what is held before the task is locked', () => {
  const holders = { holdBeneficiaryOfTask: jest.fn(), requireCanBeginTask: jest.fn() };
  const probe = (kind: string, status: string) =>
    ({ kind, status, assignment: { employeeId: 'e-beneficiary' } }) as unknown as ProvisioningTaskRecord;

  beforeEach(() => {
    jest.resetAllMocks();
    holders.holdBeneficiaryOfTask.mockResolvedValue(true);
  });

  it('holds the beneficiary of a queued grant before the task, so the claim and a departure that blocks the person take their locks in the same order', async () => {
    const action = await claimWith(holders);

    await action.beforeLock?.(tx, probe('GRANT', 'QUEUED'));

    expect(holders.holdBeneficiaryOfTask).toHaveBeenCalledWith(tx, 'e-beneficiary');
  });

  it.each([
    ['a grant already in progress', 'GRANT', 'IN_PROGRESS'],
    ['a revocation', 'REVOKE', 'QUEUED'],
  ])('holds nobody before the task for %s', async (_name, kind, status) => {
    const action = await claimWith(holders);

    await action.beforeLock?.(tx, probe(kind, status));

    expect(holders.holdBeneficiaryOfTask).not.toHaveBeenCalled();
  });
});

describe('ProvisioningService.list & get (acting scope vs read scope)', () => {
  const repo = { page: jest.fn(), find: jest.fn() };
  const views = { summaries: jest.fn(), views: jest.fn() };
  const organizationReads = {
    businessToday: jest.fn(),
    getItAdminActingScope: jest.fn(),
    getItAdminScope: jest.fn(),
    getEmployeeIdsOfWorkDepartments: jest.fn(),
    workDepartmentsOf: jest.fn(),
    findActiveUnplacedWorkIdsForDesignee: jest.fn(),
    itAdminsActingForUnplacedWork: jest.fn(),
  };
  const identity = { findUsableItAdminEmployeeIds: jest.fn() };
  const service = new ProvisioningService(
    repo as never,
    {} as never,
    views as never,
    organizationReads as never,
    identity as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    organizationReads.businessToday.mockResolvedValue('2026-11-23');
    organizationReads.findActiveUnplacedWorkIdsForDesignee.mockResolvedValue([]);
    organizationReads.itAdminsActingForUnplacedWork.mockResolvedValue(new Map());
    repo.page.mockResolvedValue({ items: [{ id: 'task-1' }], total: 1 });
    views.summaries.mockResolvedValue([{ id: 'task-1' }]);
    views.views.mockResolvedValue([{ id: 'task-1' }]);
  });

  it('MINE filters beneficiaries via getItAdminActingScope and getEmployeeIdsOfWorkDepartments', async () => {
    organizationReads.getItAdminActingScope.mockResolvedValue(['dept-1']);
    organizationReads.getEmployeeIdsOfWorkDepartments.mockResolvedValue(['emp-1']);

    const page = await service.list(ACTOR, { scope: 'MINE', page: 1, pageSize: 20 });

    expect(organizationReads.getItAdminActingScope).toHaveBeenCalledWith('e-it', expect.any(Function));
    expect(organizationReads.getEmployeeIdsOfWorkDepartments).toHaveBeenCalledWith(['dept-1'], '2026-11-23');
    expect(repo.page).toHaveBeenCalledWith(expect.objectContaining({ beneficiaryEmployeeIds: ['emp-1'] }));
    expect(page.items).toEqual([{ id: 'task-1' }]);
  });

  it('ALL filters beneficiaries via getItAdminScope (read scope) and short-circuits when empty', async () => {
    organizationReads.getItAdminScope.mockResolvedValue(['dept-2']);
    organizationReads.getEmployeeIdsOfWorkDepartments.mockResolvedValue([]);

    const page = await service.list(ACTOR, { scope: 'ALL', page: 1, pageSize: 20 });

    expect(organizationReads.getItAdminScope).toHaveBeenCalledWith('e-it', expect.any(Function));
    expect(repo.page).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
    expect(page.pagination.totalItems).toBe(0);
  });

  it('get throws ProvisioningTaskNotFoundError when beneficiary work department is outside read scope or unplaced', async () => {
    repo.find.mockResolvedValue({ id: 'task-1', assignment: { employeeId: 'emp-1' } });
    organizationReads.workDepartmentsOf.mockResolvedValue(new Map([['emp-1', 'dept-other']]));
    organizationReads.getItAdminScope.mockResolvedValue(['dept-1']);

    await expect(service.get(ACTOR, 'task-1')).rejects.toBeInstanceOf(ProvisioningTaskNotFoundError);

    organizationReads.workDepartmentsOf.mockResolvedValue(new Map());
    await expect(service.get(ACTOR, 'task-1')).rejects.toBeInstanceOf(ProvisioningTaskNotFoundError);
  });

  it('MINE includes unplaced designated tasks even when acting department scope is empty', async () => {
    organizationReads.getItAdminActingScope.mockResolvedValue([]);
    organizationReads.findActiveUnplacedWorkIdsForDesignee.mockResolvedValue(['task-unplaced-1']);

    const page = await service.list(ACTOR, { scope: 'MINE', page: 1, pageSize: 20 });

    expect(organizationReads.findActiveUnplacedWorkIdsForDesignee).toHaveBeenCalledWith('e-it', 'PROVISIONING_TASK');
    expect(repo.page).toHaveBeenCalledWith(
      expect.objectContaining({ beneficiaryEmployeeIds: [], includeTaskIds: ['task-unplaced-1'] }),
    );
    expect(page.items).toEqual([{ id: 'task-1' }]);
  });

  it('get returns task view when caller is designated for an unplaced task', async () => {
    repo.find.mockResolvedValue({ id: 'task-unplaced-1', assignment: { employeeId: 'emp-unplaced' } });
    organizationReads.workDepartmentsOf.mockResolvedValue(new Map());
    organizationReads.itAdminsActingForUnplacedWork.mockResolvedValue(
      new Map([[unplacedWorkKey('PROVISIONING_TASK', 'task-unplaced-1'), 'e-it']]),
    );

    const view = await service.get(ACTOR, 'task-unplaced-1');

    expect(view).toEqual({ id: 'task-1' });
  });

  it('get returns task view when beneficiary work department is inside read scope', async () => {
    repo.find.mockResolvedValue({ id: 'task-1', assignment: { employeeId: 'emp-1' } });
    organizationReads.workDepartmentsOf.mockResolvedValue(new Map([['emp-1', 'dept-1']]));
    organizationReads.getItAdminScope.mockResolvedValue(['dept-1']);

    const view = await service.get(ACTOR, 'task-1');

    expect(view).toEqual({ id: 'task-1' });
  });
});
