import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SaasIssueError } from './saas-issue.errors';
import type { SaasIssueCalendar } from './saas-issue-calendar.service';
import type { SaasIssueFactsRepo } from './saas-issue-facts.repo';
import type { SaasIssueNotifier } from './saas-issue-notifier.service';
import type { NewSaasIssue, SaasIssueRecord, SaasIssueRepo } from './saas-issue.repo';
import { SaasIssueService } from './saas-issue.service';

const actor: AuthenticatedPrincipal = {
  subject: 'user-1',
  appUserId: 'user-1',
  employeeId: 'emp-1',
  directRoles: ['EMPLOYEE'],
  roles: ['EMPLOYEE'],
  sessionId: 'sess-1',
};

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
  assignedItAdminEmployeeId: 'it-1',
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
  const workDepartmentsOf = jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']]));
  const itAdminsActingFor = jest
    .fn()
    .mockResolvedValue(
      new Map([['dept-1', { inCharge: 'it-1', substitute: null, defaultAssignee: 'it-1', actors: ['it-1'] }]]),
    );
  const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1']));
  const findUsableSuperAdminEmployeeId = jest.fn().mockResolvedValue('sa-1');
  const nextCode = jest.fn().mockResolvedValue('BM11-2026-000001');
  const insert = jest.fn((_tx: DbTx, code: string, input: NewSaasIssue) =>
    Promise.resolve(
      baseIssue({
        code,
        assignedItAdminEmployeeId: input.assignedItAdminEmployeeId,
        assignedByFallback: input.assignedByFallback,
      }),
    ),
  );
  const lock = jest.fn();
  const update = jest.fn();
  const insertEntry = jest
    .fn()
    .mockResolvedValue({ id: 'entry-1', fromState: 'WAITING_REPORTER', toState: 'IN_PROGRESS' });
  const assignmentFacts = jest.fn().mockResolvedValue({
    assignment: { employeeId: 'emp-1', kind: 'PERSONAL', failedAt: null, cancelledAt: null, validUntil: null },
    planId: 'plan-1',
    grantTaskId: null,
  });
  const submitted = jest.fn().mockResolvedValue(undefined);
  const awaitingAssignee = jest.fn().mockResolvedValue(undefined);
  const stateChanged = jest.fn().mockResolvedValue(undefined);

  const service = new SaasIssueService(
    runner,
    {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue('2026-11-02'),
      workDepartmentsOf,
      itAdminsActingFor,
    } as unknown as OrganizationReadApi,
    { findUsableItAdminEmployeeIds, findUsableSuperAdminEmployeeId } as unknown as IdentityAccessApi,
    { responseDueOn: jest.fn().mockResolvedValue('2026-11-03') } as unknown as SaasIssueCalendar,
    { nextCode, insert, lock, update, insertEntry } as unknown as SaasIssueRepo,
    { assignmentFacts } as unknown as SaasIssueFactsRepo,
    { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
    { submitted, awaitingAssignee, stateChanged } as unknown as SaasIssueNotifier,
  );

  return {
    service,
    tx,
    workDepartmentsOf,
    itAdminsActingFor,
    findUsableSuperAdminEmployeeId,
    insert,
    lock,
    assignmentFacts,
    submitted,
    awaitingAssignee,
  };
}

const submitInput = {
  assignmentId: 'assign-1',
  category: 'NO_ACCESS' as const,
  impact: 'UNUSABLE' as const,
  description: '  Cannot sign in  ',
  occurredAt: new Date(Date.now() - 60_000),
};

describe('SaasIssueService', () => {
  describe('submit (W2-27 H6, W2-Q10)', () => {
    it('assigns to usable in-charge IT Admin with assignedByFallback false and notifies them', async () => {
      const h = createHarness();

      const result = await h.service.submit(actor, submitInput);

      expect(result.assignedItAdminEmployeeId).toBe('it-1');
      expect(result.assignedByFallback).toBe(false);
      expect(h.submitted).toHaveBeenCalledWith(h.tx, result, 'plan-1');
      expect(h.awaitingAssignee).not.toHaveBeenCalled();
    });

    it('assigns to appointed substitute with assignedByFallback true over in-charge', async () => {
      const h = createHarness();
      h.itAdminsActingFor.mockResolvedValue(
        new Map([
          ['dept-1', { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-1', 'it-sub'] }],
        ]),
      );

      const result = await h.service.submit(actor, submitInput);

      expect(result.assignedItAdminEmployeeId).toBe('it-sub');
      expect(result.assignedByFallback).toBe(true);
      expect(h.submitted).toHaveBeenCalledWith(h.tx, result, 'plan-1');
      expect(h.awaitingAssignee).not.toHaveBeenCalled();
    });

    it('creates an unassigned NEW issue and notifies Super Admin once when department has no acting IT Admin', async () => {
      const h = createHarness();
      h.itAdminsActingFor.mockResolvedValue(
        new Map([['dept-1', { inCharge: null, substitute: null, defaultAssignee: null, actors: [] }]]),
      );

      const result = await h.service.submit(actor, submitInput);

      expect(result.state).toBe('NEW');
      expect(result.assignedItAdminEmployeeId).toBeNull();
      expect(result.assignedByFallback).toBe(false);
      expect(h.insert).toHaveBeenCalledWith(
        h.tx,
        'BM11-2026-000001',
        expect.objectContaining({ assignedItAdminEmployeeId: null, assignedByFallback: false }),
      );
      expect(h.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(h.tx);
      expect(h.awaitingAssignee).toHaveBeenCalledWith(h.tx, result, 'plan-1', 'dept-1', 'sa-1');
      expect(h.submitted).not.toHaveBeenCalled();
    });

    it('creates an unassigned NEW issue with departmentId null when reporter is unplaced', async () => {
      const h = createHarness();
      h.workDepartmentsOf.mockResolvedValue(new Map());

      const result = await h.service.submit(actor, submitInput);

      expect(result.assignedItAdminEmployeeId).toBeNull();
      expect(result.assignedByFallback).toBe(false);
      expect(h.itAdminsActingFor).not.toHaveBeenCalled();
      expect(h.awaitingAssignee).toHaveBeenCalledWith(h.tx, result, 'plan-1', null, 'sa-1');
    });

    it('still creates the unassigned issue when no Super Admin is usable', async () => {
      const h = createHarness();
      h.workDepartmentsOf.mockResolvedValue(new Map());
      h.findUsableSuperAdminEmployeeId.mockResolvedValue(null);

      const result = await h.service.submit(actor, submitInput);

      expect(result.assignedItAdminEmployeeId).toBeNull();
      expect(h.awaitingAssignee).not.toHaveBeenCalled();
    });

    it('preserves OCCURRED_IN_FUTURE, ASSIGNMENT_NOT_YOURS, and ASSIGNMENT_NOT_OPEN error codes', async () => {
      const h = createHarness();
      await expect(
        h.service.submit(actor, { ...submitInput, occurredAt: new Date(Date.now() + 60_000) }),
      ).rejects.toMatchObject({ name: 'SaasIssueError', problem: 'OCCURRED_IN_FUTURE' });

      h.assignmentFacts.mockResolvedValueOnce(null);
      await expect(h.service.submit(actor, submitInput)).rejects.toMatchObject({
        name: 'SaasIssueError',
        problem: 'ASSIGNMENT_NOT_YOURS',
      });

      h.assignmentFacts.mockResolvedValueOnce({
        assignment: {
          employeeId: 'emp-1',
          kind: 'PERSONAL',
          failedAt: new Date(),
          cancelledAt: null,
          validUntil: null,
        },
        planId: 'plan-1',
        grantTaskId: null,
      });
      await expect(h.service.submit(actor, submitInput)).rejects.toMatchObject({
        name: 'SaasIssueError',
        problem: 'ASSIGNMENT_NOT_OPEN',
      });
    });
  });

  describe('addMessage & reopen guards preserved', () => {
    it('enforces NOT_FOUND, MESSAGE_REQUIRED, CLOSED on addMessage', async () => {
      const h = createHarness();
      h.lock.mockResolvedValueOnce(null);
      await expect(h.service.addMessage(actor, 'issue-1', 'hi')).rejects.toMatchObject({
        name: 'SaasIssueError',
        problem: 'NOT_FOUND',
      });

      h.lock.mockResolvedValueOnce(baseIssue());
      await expect(h.service.addMessage(actor, 'issue-1', '   ')).rejects.toMatchObject({
        name: 'SaasIssueError',
        problem: 'MESSAGE_REQUIRED',
      });

      h.lock.mockResolvedValueOnce(baseIssue({ state: 'CLOSED' }));
      await expect(h.service.addMessage(actor, 'issue-1', 'hi')).rejects.toMatchObject({
        name: 'SaasIssueError',
        problem: 'CLOSED',
      });
    });

    it('enforces NOT_FOUND, REASON_REQUIRED, NOT_RESOLVED, REOPEN_WINDOW_ENDED on reopen', async () => {
      const h = createHarness();
      h.lock.mockResolvedValueOnce(baseIssue({ reporterEmployeeId: 'other' }));
      await expect(h.service.reopen(actor, 'issue-1', 'still broken')).rejects.toBeInstanceOf(SaasIssueError);

      h.lock.mockResolvedValueOnce(baseIssue({ state: 'RESOLVED', reopenUntil: '2026-11-05' }));
      await expect(h.service.reopen(actor, 'issue-1', '   ')).rejects.toMatchObject({ problem: 'REASON_REQUIRED' });

      h.lock.mockResolvedValueOnce(baseIssue({ state: 'NEW' }));
      await expect(h.service.reopen(actor, 'issue-1', 'why')).rejects.toMatchObject({ problem: 'NOT_RESOLVED' });

      h.lock.mockResolvedValueOnce(baseIssue({ state: 'RESOLVED', reopenUntil: '2026-11-01' }));
      await expect(h.service.reopen(actor, 'issue-1', 'too late')).rejects.toMatchObject({
        problem: 'REOPEN_WINDOW_ENDED',
      });
    });
  });
});
