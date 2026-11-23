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

  it('notifies assigned IT Admin when an assigned NEW issue is overdue', async () => {
    const h = createHarness();
    const overdueAssigned = baseIssue({ assignedItAdminEmployeeId: 'it-1', responseDueOn: '2026-11-03' });
    h.listOverdueUnnoticed.mockResolvedValue([overdueAssigned]);
    h.lock.mockResolvedValue(overdueAssigned);

    const result = await h.service.run();

    expect(result).toEqual({ assigned: 0, closed: 0, told: 1 });
    expect(h.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(h.responseOverdue).toHaveBeenCalledWith(h.tx, overdueAssigned, 'it-1');
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
