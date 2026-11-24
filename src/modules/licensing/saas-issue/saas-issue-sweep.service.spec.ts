import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SaasIssueFactsRepo } from './saas-issue-facts.repo';
import type { SaasIssueNotifier } from './saas-issue-notifier.service';
import type { SaasIssueRecord, SaasIssueRepo } from './saas-issue.repo';
import { SaasIssueSweepService } from './saas-issue-sweep.service';

const baseIssue = (overrides: Partial<SaasIssueRecord> = {}): SaasIssueRecord => ({
  id: 'issue-1',
  code: 'BM11-2026-000001',
  organizationId: 'org-1',
  reporterEmployeeId: 'emp-1',
  assignmentId: 'assign-1',
  grantTaskId: null,
  category: 'NO_ACCESS',
  impact: 'UNUSABLE',
  description: 'Cannot sign in',
  occurredAt: new Date('2026-11-02T07:00:00Z'),
  state: 'NEW',
  assignedItAdminEmployeeId: null,
  assignedByFallback: false,
  responseDueOn: '2026-11-03',
  responseOverdueNoticedAt: null,
  resolution: null,
  vendorTicketRef: null,
  duplicateOfId: null,
  duplicateReason: null,
  linkedWork: null,
  resolvedAt: null,
  reopenUntil: null,
  closedAt: null,
  reopenCount: 0,
  createdAt: new Date('2026-11-02T08:00:00Z'),
  updatedAt: new Date('2026-11-02T08:00:00Z'),
  ...overrides,
});

function createHarness() {
  const tx = {} as DbTx;
  const runner = { run: jest.fn((fn: (t: DbTx) => Promise<unknown>) => fn(tx)) } as unknown as TransactionRunner;
  const itAdminsActingFor = jest.fn().mockResolvedValue(new Map());
  const findUsableSuperAdminEmployeeId = jest.fn().mockResolvedValue('sa-1');
  const listUnassigned = jest.fn().mockResolvedValue([]);
  const assignUnassigned = jest.fn();
  const listLapsed = jest.fn().mockResolvedValue([]);
  const listOverdueUnnoticed = jest.fn().mockResolvedValue([]);
  const lock = jest.fn();
  const update = jest.fn();
  const insertEntry = jest.fn();
  const markOverdueNoticed = jest.fn().mockResolvedValue(true);
  const record = jest.fn().mockResolvedValue(undefined);
  const submitted = jest.fn().mockResolvedValue(undefined);
  const responseOverdue = jest.fn().mockResolvedValue(undefined);
  const reopenWindowLapsed = jest.fn().mockResolvedValue(undefined);

  const service = new SaasIssueSweepService(
    runner,
    {
      businessToday: jest.fn().mockResolvedValue('2026-11-05'),
      workDepartmentsOf: jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']])),
      itAdminsActingFor,
    } as unknown as OrganizationReadApi,
    {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set()),
      findUsableSuperAdminEmployeeId,
    } as unknown as IdentityAccessApi,
    {
      listUnassigned,
      assignUnassigned,
      listLapsed,
      listOverdueUnnoticed,
      lock,
      update,
      insertEntry,
      markOverdueNoticed,
    } as unknown as SaasIssueRepo,
    { planIdsOf: jest.fn().mockResolvedValue(new Map([['assign-1', 'plan-1']])) } as unknown as SaasIssueFactsRepo,
    { record } as unknown as AuditApi,
    { submitted, responseOverdue, reopenWindowLapsed } as unknown as SaasIssueNotifier,
  );

  return {
    service,
    tx,
    itAdminsActingFor,
    findUsableSuperAdminEmployeeId,
    listUnassigned,
    assignUnassigned,
    listLapsed,
    listOverdueUnnoticed,
    lock,
    update,
    record,
    submitted,
    responseOverdue,
    reopenWindowLapsed,
  };
}

describe('SaasIssueSweepService', () => {
  it('assigns an unassigned NEW issue when an acting IT Admin (substitute) becomes available, records SAAS_ISSUE.ASSIGNED, and notifies them', async () => {
    const h = createHarness();
    const unassigned = baseIssue();
    const assigned = baseIssue({ assignedItAdminEmployeeId: 'it-sub', assignedByFallback: true });
    h.listUnassigned.mockResolvedValue([unassigned]);
    h.lock.mockResolvedValue(unassigned);
    h.itAdminsActingFor.mockResolvedValue(
      new Map([['dept-1', { inCharge: null, substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-sub'] }]]),
    );
    h.assignUnassigned.mockResolvedValue(assigned);

    const result = await h.service.run(new Date('2026-11-05T10:00:00Z'));

    expect(result).toEqual({ assigned: 1, closed: 0, told: 0 });
    expect(h.assignUnassigned).toHaveBeenCalledWith(h.tx, 'issue-1', {
      employeeId: 'it-sub',
      byFallback: true,
    });
    expect(h.record).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        actorKind: 'SYSTEM',
        action: 'SAAS_ISSUE.ASSIGNED',
        resourceType: 'SaasIssue',
        resourceId: 'issue-1',
        before: { assignedItAdminEmployeeId: null, assignedByFallback: false },
        after: { code: 'BM11-2026-000001', assignedItAdminEmployeeId: 'it-sub', assignedByFallback: true },
      }),
    );
    expect(h.submitted).toHaveBeenCalledWith(h.tx, assigned, 'plan-1');
  });

  it('skips unassigned issue on post-lock re-check if already assigned or no acting IT Admin exists', async () => {
    const h = createHarness();
    const candidate = baseIssue();
    h.listUnassigned.mockResolvedValue([candidate]);
    h.lock.mockResolvedValueOnce(baseIssue({ assignedItAdminEmployeeId: 'it-1' }));

    expect(await h.service.run()).toEqual({ assigned: 0, closed: 0, told: 0 });
    expect(h.assignUnassigned).not.toHaveBeenCalled();

    h.lock.mockResolvedValueOnce(candidate);
    h.itAdminsActingFor.mockResolvedValue(
      new Map([['dept-1', { inCharge: null, substitute: null, defaultAssignee: null, actors: [] }]]),
    );
    expect(await h.service.run()).toEqual({ assigned: 0, closed: 0, told: 0 });
    expect(h.assignUnassigned).not.toHaveBeenCalled();
  });

  it('notifies usable Super Admin when an unassigned NEW issue is overdue for first response', async () => {
    const h = createHarness();
    const overdueUnassigned = baseIssue({ responseDueOn: '2026-11-03' });
    h.listOverdueUnnoticed.mockResolvedValue([overdueUnassigned]);
    h.lock.mockResolvedValue(overdueUnassigned);

    const result = await h.service.run();

    expect(result).toEqual({ assigned: 0, closed: 0, told: 1 });
    expect(h.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(h.tx);
    expect(h.record).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        action: 'SAAS_ISSUE.RESPONSE_OVERDUE',
      }),
    );
    const call = h.record.mock.calls[0] as [unknown, { after: { notifyEmployeeId: string } }];
    expect(call[1].after.notifyEmployeeId).toBe('sa-1');
    expect(h.responseOverdue).toHaveBeenCalledWith(h.tx, overdueUnassigned, 'sa-1');
  });

  it('notifies acting IT Admins of the reporter department when an assigned NEW issue is overdue', async () => {
    const h = createHarness();
    const overdueAssigned = baseIssue({ assignedItAdminEmployeeId: 'it-1', responseDueOn: '2026-11-03' });
    h.listOverdueUnnoticed.mockResolvedValue([overdueAssigned]);
    h.lock.mockResolvedValue(overdueAssigned);
    h.itAdminsActingFor.mockResolvedValue(
      new Map([['dept-1', { inCharge: 'it-1', substitute: null, defaultAssignee: 'it-1', actors: ['it-1'] }]]),
    );

    const result = await h.service.run();

    expect(result).toEqual({ assigned: 0, closed: 0, told: 1 });
    expect(h.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(h.responseOverdue).toHaveBeenCalledWith(h.tx, overdueAssigned, 'it-1');
  });

  it('notifies the appointed substitute instead of an unusable assignee, and falls back to Super Admin when acting set is empty', async () => {
    const sub = createHarness();
    const overdueWithLockedInCharge = baseIssue({
      assignedItAdminEmployeeId: 'it-locked',
      responseDueOn: '2026-11-03',
    });
    sub.listOverdueUnnoticed.mockResolvedValue([overdueWithLockedInCharge]);
    sub.lock.mockResolvedValue(overdueWithLockedInCharge);
    sub.itAdminsActingFor.mockResolvedValue(
      new Map([['dept-1', { inCharge: null, substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-sub'] }]]),
    );

    expect(await sub.service.run()).toEqual({ assigned: 0, closed: 0, told: 1 });
    expect(sub.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(sub.responseOverdue).toHaveBeenCalledTimes(1);
    expect(sub.responseOverdue).toHaveBeenCalledWith(sub.tx, overdueWithLockedInCharge, 'it-sub');

    const fallback = createHarness();
    fallback.listOverdueUnnoticed.mockResolvedValue([overdueWithLockedInCharge]);
    fallback.lock.mockResolvedValue(overdueWithLockedInCharge);
    fallback.itAdminsActingFor.mockResolvedValue(
      new Map([['dept-1', { inCharge: null, substitute: null, defaultAssignee: null, actors: [] }]]),
    );

    expect(await fallback.service.run()).toEqual({ assigned: 0, closed: 0, told: 1 });
    expect(fallback.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(fallback.tx);
    expect(fallback.responseOverdue).toHaveBeenCalledWith(fallback.tx, overdueWithLockedInCharge, 'sa-1');
  });

  it('notifies both usable in-charge and substitute IT Admins once per overdue issue', async () => {
    const h = createHarness();
    const overdue = baseIssue({ assignedItAdminEmployeeId: 'it-sub', responseDueOn: '2026-11-03' });
    h.listOverdueUnnoticed.mockResolvedValue([overdue]);
    h.lock.mockResolvedValue(overdue);
    h.itAdminsActingFor.mockResolvedValue(
      new Map([
        ['dept-1', { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-1', 'it-sub'] }],
      ]),
    );

    expect(await h.service.run()).toEqual({ assigned: 0, closed: 0, told: 1 });
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.responseOverdue).toHaveBeenCalledTimes(2);
    expect(h.responseOverdue).toHaveBeenNthCalledWith(1, h.tx, overdue, 'it-1');
    expect(h.responseOverdue).toHaveBeenNthCalledWith(2, h.tx, overdue, 'it-sub');
  });

  it('paginates unassigned NEW issues with cursor so a full first batch without acting IT Admins does not starve later batches', async () => {
    const h = createHarness();
    const firstBatch = Array.from({ length: 200 }, (_, index) =>
      baseIssue({
        id: `unassigned-${String(index + 1).padStart(3, '0')}`,
        reporterEmployeeId: 'emp-empty-dept',
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)),
      }),
    );
    const assignable = baseIssue({
      id: 'unassigned-201',
      reporterEmployeeId: 'emp-1',
      createdAt: new Date('2026-11-02T08:00:00Z'),
    });
    const assigned = baseIssue({
      id: 'unassigned-201',
      reporterEmployeeId: 'emp-1',
      assignedItAdminEmployeeId: 'it-1',
      assignedByFallback: false,
    });
    h.listUnassigned.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce([assignable]);
    h.lock.mockImplementation((_tx: unknown, id: string) =>
      Promise.resolve(id === 'unassigned-201' ? assignable : (firstBatch.find((item) => item.id === id) ?? null)),
    );
    (
      h.service as unknown as {
        organizationReads: { workDepartmentsOf: jest.Mock };
      }
    ).organizationReads.workDepartmentsOf.mockImplementation((ids: string[]) =>
      Promise.resolve(new Map([[ids[0], ids[0] === 'emp-1' ? 'dept-1' : 'dept-empty']])),
    );
    h.itAdminsActingFor.mockImplementation((deptIds: string[]) =>
      Promise.resolve(
        deptIds[0] === 'dept-1'
          ? new Map([['dept-1', { inCharge: 'it-1', substitute: null, defaultAssignee: 'it-1', actors: ['it-1'] }]])
          : new Map([['dept-empty', { inCharge: null, substitute: null, defaultAssignee: null, actors: [] }]]),
      ),
    );
    h.assignUnassigned.mockResolvedValue(assigned);

    const result = await h.service.run(new Date('2026-11-05T10:00:00Z'));

    expect(result).toEqual({ assigned: 1, closed: 0, told: 0 });
    expect(h.listUnassigned).toHaveBeenCalledTimes(2);
    expect(h.listUnassigned).toHaveBeenNthCalledWith(1, 200, null);
    expect(h.listUnassigned).toHaveBeenNthCalledWith(2, 200, {
      createdAt: firstBatch[199].createdAt,
      id: firstBatch[199].id,
    });
    expect(h.assignUnassigned).toHaveBeenCalledTimes(1);
    expect(h.assignUnassigned).toHaveBeenCalledWith(h.tx, 'unassigned-201', {
      employeeId: 'it-1',
      byFallback: false,
    });
  });

  it('closes lapsed RESOLVED issues and notifies reporter', async () => {
    const h = createHarness();
    const lapsed = baseIssue({ state: 'RESOLVED', assignedItAdminEmployeeId: 'it-1', reopenUntil: '2026-11-04' });
    h.listLapsed.mockResolvedValue([lapsed]);
    h.lock.mockResolvedValue(lapsed);

    const result = await h.service.run(new Date('2026-11-05T10:00:00Z'));

    expect(result).toEqual({ assigned: 0, closed: 1, told: 0 });
    expect(h.update).toHaveBeenCalledWith(h.tx, 'issue-1', { state: 'CLOSED', closedAt: expect.any(Date) as Date });
    expect(h.reopenWindowLapsed).toHaveBeenCalledWith(h.tx, lapsed);
  });
});
