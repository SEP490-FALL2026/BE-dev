import { HttpStatus } from '@nestjs/common';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SaasIssueError } from './saas-issue.errors';
import { SAAS_ISSUE_ERROR_EXAMPLES, toSaasIssueApiException } from './saas-issue.http-errors';
import type { SaasIssueCalendar } from './saas-issue-calendar.service';
import type { SaasIssueFactsRepo } from './saas-issue-facts.repo';
import type { SaasIssueNotifier } from './saas-issue-notifier.service';
import type { SaasIssueRecord, SaasIssueRepo } from './saas-issue.repo';
import { SaasIssueHandlingService, type TransitionInput } from './saas-issue-handling.service';

interface RecordedAuditEvent {
  action: string;
  after?: Record<string, unknown>;
}

const principal = (employeeId: string): AuthenticatedPrincipal => ({
  subject: `user-${employeeId}`,
  appUserId: `user-${employeeId}`,
  employeeId,
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
  sessionId: `sess-${employeeId}`,
});

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
  const businessToday = jest.fn().mockResolvedValue('2026-11-02');
  const workDepartmentsOf = jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']]));
  const itAdminsActingFor = jest
    .fn()
    .mockResolvedValue(
      new Map([['dept-1', { inCharge: 'it-1', substitute: null, defaultAssignee: 'it-1', actors: ['it-1'] }]]),
    );
  const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1']));
  const lock = jest.fn<Promise<SaasIssueRecord | null>, [DbTx, string]>().mockResolvedValue(baseIssue());
  const update = jest.fn((_tx: DbTx, id: string, patch: Partial<SaasIssueRecord>) =>
    Promise.resolve(baseIssue({ id, ...patch })),
  );
  const insertEntry = jest.fn().mockResolvedValue({
    id: 'entry-1',
    fromState: 'NEW',
    toState: 'IN_PROGRESS',
  });
  const grantTaskExists = jest.fn().mockResolvedValue(true);
  const record = jest.fn<Promise<void>, [DbTx, RecordedAuditEvent]>().mockResolvedValue(undefined);
  const stateChanged = jest.fn().mockResolvedValue(undefined);

  const service = new SaasIssueHandlingService(
    runner,
    { businessToday, workDepartmentsOf, itAdminsActingFor } as unknown as OrganizationReadApi,
    { findUsableItAdminEmployeeIds } as unknown as IdentityAccessApi,
    { reopenUntil: jest.fn().mockResolvedValue('2026-11-09') } as unknown as SaasIssueCalendar,
    { lock, update, insertEntry } as unknown as SaasIssueRepo,
    { grantTaskExists } as unknown as SaasIssueFactsRepo,
    { record } as unknown as AuditApi,
    { stateChanged } as unknown as SaasIssueNotifier,
  );

  const auditAfter = (index: number) => record.mock.calls[index]?.[1]?.after ?? {};

  return {
    service,
    tx,
    businessToday,
    workDepartmentsOf,
    itAdminsActingFor,
    findUsableItAdminEmployeeIds,
    lock,
    update,
    insertEntry,
    grantTaskExists,
    record,
    auditAfter,
    stateChanged,
  };
}

const transitionInput = (overrides: Partial<TransitionInput> = {}): TransitionInput => ({
  to: 'IN_PROGRESS',
  message: null,
  resolution: null,
  vendorTicketRef: null,
  linkedWork: null,
  ...overrides,
});

describe('SaasIssueHandlingService', () => {
  describe('HTTP error mapping', () => {
    it('maps NOT_IN_CHARGE to 403 SAAS_ISSUE.NOT_IN_CHARGE and exposes the OpenAPI example', () => {
      const ex = toSaasIssueApiException(new SaasIssueError('NOT_IN_CHARGE')) as ApiException;

      expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(ex.getResponse()).toMatchObject({
        code: 'SAAS_ISSUE.NOT_IN_CHARGE',
        message: 'Only the acting IT Admin of the reporter’s department may handle this report.',
      });
      expect(SAAS_ISSUE_ERROR_EXAMPLES.NOT_IN_CHARGE).toBeDefined();
    });
  });

  describe('transition', () => {
    it('refuses a non-acting IT Admin with NOT_IN_CHARGE (403 SAAS_ISSUE.NOT_IN_CHARGE)', async () => {
      const h = createHarness();

      let caught: unknown;
      try {
        await h.service.transition(principal('it-other'), 'issue-1', transitionInput());
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(SaasIssueError);
      expect((caught as SaasIssueError).problem).toBe('NOT_IN_CHARGE');
      const apiEx = toSaasIssueApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(apiEx.getResponse()).toMatchObject({ code: 'SAAS_ISSUE.NOT_IN_CHARGE' });
      expect(h.update).not.toHaveBeenCalled();
      expect(h.record).not.toHaveBeenCalled();
    });

    it('refuses an unassigned issue with NOT_IN_CHARGE for any IT Admin', async () => {
      const h = createHarness();
      h.lock.mockResolvedValue(baseIssue({ assignedItAdminEmployeeId: null }));

      await expect(h.service.transition(principal('it-1'), 'issue-1', transitionInput())).rejects.toMatchObject({
        name: 'SaasIssueError',
        problem: 'NOT_IN_CHARGE',
      });
      expect(h.workDepartmentsOf).not.toHaveBeenCalled();
      expect(h.update).not.toHaveBeenCalled();
    });

    it('refuses when the reporter has no work department on today', async () => {
      const h = createHarness();
      h.workDepartmentsOf.mockResolvedValue(new Map());

      await expect(h.service.transition(principal('it-1'), 'issue-1', transitionInput())).rejects.toMatchObject({
        name: 'SaasIssueError',
        problem: 'NOT_IN_CHARGE',
      });
      expect(h.itAdminsActingFor).not.toHaveBeenCalled();
    });

    it('allows usable in-charge IT Admin to transition and resolve without bySubstitute', async () => {
      const h = createHarness();
      h.lock.mockResolvedValue(baseIssue({ state: 'IN_PROGRESS' }));

      await h.service.transition(
        principal('it-1'),
        'issue-1',
        transitionInput({ to: 'RESOLVED', resolution: 'Fixed' }),
      );

      expect(h.insertEntry).toHaveBeenCalledWith(
        h.tx,
        expect.objectContaining({ authorEmployeeId: 'it-1', onBehalfOfEmployeeId: null }),
      );
      expect(h.record).toHaveBeenCalledTimes(2);
      const transitionedAfter = h.auditAfter(0);
      const resolvedAfter = h.auditAfter(1);
      expect(transitionedAfter.onBehalfOf).toBeNull();
      expect(transitionedAfter).not.toHaveProperty('bySubstitute');
      expect(resolvedAfter.onBehalfOf).toBeNull();
      expect(resolvedAfter).not.toHaveProperty('bySubstitute');
    });

    it('sets onBehalfOf when usable in-charge IT Admin acts on an issue previously assigned to another', async () => {
      const h = createHarness();
      h.lock.mockResolvedValue(baseIssue({ assignedItAdminEmployeeId: 'it-old-sub' }));

      await h.service.transition(principal('it-1'), 'issue-1', transitionInput());

      expect(h.insertEntry).toHaveBeenCalledWith(
        h.tx,
        expect.objectContaining({ authorEmployeeId: 'it-1', onBehalfOfEmployeeId: 'it-old-sub' }),
      );
      const transitionedAfter = h.auditAfter(0);
      expect(transitionedAfter.onBehalfOf).toBe('it-old-sub');
      expect(transitionedAfter).not.toHaveProperty('bySubstitute');
    });

    it('allows appointed usable substitute when in-charge is locked, setting bySubstitute: true and onBehalfOf', async () => {
      const h = createHarness();
      h.itAdminsActingFor.mockResolvedValue(
        new Map([['dept-1', { inCharge: null, substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-sub'] }]]),
      );
      h.lock.mockResolvedValue(baseIssue({ state: 'IN_PROGRESS', assignedItAdminEmployeeId: 'it-1' }));

      await h.service.transition(
        principal('it-sub'),
        'issue-1',
        transitionInput({ to: 'RESOLVED', resolution: 'Resolved by sub' }),
      );

      expect(h.insertEntry).toHaveBeenCalledWith(
        h.tx,
        expect.objectContaining({ authorEmployeeId: 'it-sub', onBehalfOfEmployeeId: 'it-1' }),
      );
      expect(h.record).toHaveBeenCalledTimes(2);
      expect(h.auditAfter(0)).toMatchObject({ onBehalfOf: 'it-1', bySubstitute: true });
      expect(h.auditAfter(1)).toMatchObject({ onBehalfOf: 'it-1', bySubstitute: true });
    });

    it('uses acting.inCharge as onBehalfOf when substitute acts while in-charge is active', async () => {
      const h = createHarness();
      h.itAdminsActingFor.mockResolvedValue(
        new Map([
          ['dept-1', { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-1', 'it-sub'] }],
        ]),
      );
      h.lock.mockResolvedValue(baseIssue({ assignedItAdminEmployeeId: 'it-sub' }));

      await h.service.transition(principal('it-sub'), 'issue-1', transitionInput());

      expect(h.insertEntry).toHaveBeenCalledWith(h.tx, expect.objectContaining({ onBehalfOfEmployeeId: 'it-1' }));
      expect(h.auditAfter(0)).toMatchObject({ onBehalfOf: 'it-1', bySubstitute: true });
    });

    it('preserves NOT_FOUND, INVALID_TRANSITION, RESOLUTION_REQUIRED, MESSAGE_REQUIRED, and LINKED_WORK_INVALID', async () => {
      const h = createHarness();

      h.lock.mockResolvedValueOnce(null);
      await expect(h.service.transition(principal('it-1'), 'issue-1', transitionInput())).rejects.toMatchObject({
        problem: 'NOT_FOUND',
      });

      h.lock.mockResolvedValueOnce(baseIssue({ state: 'CLOSED' }));
      await expect(h.service.transition(principal('it-1'), 'issue-1', transitionInput())).rejects.toMatchObject({
        problem: 'INVALID_TRANSITION',
      });

      h.lock.mockResolvedValueOnce(baseIssue({ state: 'IN_PROGRESS' }));
      await expect(
        h.service.transition(principal('it-1'), 'issue-1', transitionInput({ to: 'RESOLVED', resolution: '   ' })),
      ).rejects.toMatchObject({ problem: 'RESOLUTION_REQUIRED' });

      h.lock.mockResolvedValueOnce(baseIssue({ state: 'IN_PROGRESS' }));
      await expect(
        h.service.transition(principal('it-1'), 'issue-1', transitionInput({ to: 'WAITING_REPORTER', message: null })),
      ).rejects.toMatchObject({ problem: 'MESSAGE_REQUIRED' });

      h.lock.mockResolvedValueOnce(baseIssue({ state: 'IN_PROGRESS' }));
      h.grantTaskExists.mockResolvedValueOnce(false);
      await expect(
        h.service.transition(
          principal('it-1'),
          'issue-1',
          transitionInput({ to: 'RESOLVED', resolution: 'Done', linkedWork: { grantTaskId: 'missing-task' } }),
        ),
      ).rejects.toMatchObject({ problem: 'LINKED_WORK_INVALID', reason: 'GRANT_TASK_NOT_FOUND' });
    });
  });

  describe('markDuplicate', () => {
    it('refuses a non-acting IT Admin with NOT_IN_CHARGE', async () => {
      const h = createHarness();
      h.lock.mockImplementation((_tx: DbTx, id: string) => Promise.resolve(baseIssue({ id, state: 'NEW' })));

      let caught: unknown;
      try {
        await h.service.markDuplicate(principal('it-other'), 'issue-2', { ofIssueId: 'issue-1', reason: 'Same' });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(SaasIssueError);
      expect((caught as SaasIssueError).problem).toBe('NOT_IN_CHARGE');
      const apiEx = toSaasIssueApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(apiEx.getResponse()).toMatchObject({ code: 'SAAS_ISSUE.NOT_IN_CHARGE' });
      expect(h.update).not.toHaveBeenCalled();
    });

    it('refuses an unassigned issue with NOT_IN_CHARGE', async () => {
      const h = createHarness();
      h.lock.mockImplementation((_tx: DbTx, id: string) =>
        Promise.resolve(baseIssue({ id, assignedItAdminEmployeeId: id === 'issue-2' ? null : 'it-1' })),
      );

      await expect(
        h.service.markDuplicate(principal('it-1'), 'issue-2', { ofIssueId: 'issue-1', reason: 'Same' }),
      ).rejects.toMatchObject({ name: 'SaasIssueError', problem: 'NOT_IN_CHARGE' });
      expect(h.update).not.toHaveBeenCalled();
    });

    it('allows usable in-charge IT Admin without bySubstitute', async () => {
      const h = createHarness();
      h.lock.mockImplementation((_tx: DbTx, id: string) => Promise.resolve(baseIssue({ id, state: 'NEW' })));

      await h.service.markDuplicate(principal('it-1'), 'issue-2', { ofIssueId: 'issue-1', reason: '  Same  ' });

      expect(h.insertEntry).toHaveBeenCalledWith(
        h.tx,
        expect.objectContaining({ authorEmployeeId: 'it-1', onBehalfOfEmployeeId: null, toState: 'DUPLICATE' }),
      );
      expect(h.record).toHaveBeenCalledTimes(1);
      const after = h.auditAfter(0);
      expect(after).toMatchObject({ state: 'DUPLICATE', ofIssueId: 'issue-1', onBehalfOf: null });
      expect(after).not.toHaveProperty('bySubstitute');
    });

    it('allows appointed usable substitute with bySubstitute: true and onBehalfOf in SAAS_ISSUE.DUPLICATED', async () => {
      const h = createHarness();
      h.itAdminsActingFor.mockResolvedValue(
        new Map([['dept-1', { inCharge: null, substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-sub'] }]]),
      );
      h.lock.mockImplementation((_tx: DbTx, id: string) =>
        Promise.resolve(baseIssue({ id, state: 'NEW', assignedItAdminEmployeeId: 'it-1' })),
      );

      await h.service.markDuplicate(principal('it-sub'), 'issue-2', { ofIssueId: 'issue-1', reason: 'Same' });

      expect(h.insertEntry).toHaveBeenCalledWith(
        h.tx,
        expect.objectContaining({ authorEmployeeId: 'it-sub', onBehalfOfEmployeeId: 'it-1', toState: 'DUPLICATE' }),
      );
      expect(h.auditAfter(0)).toMatchObject({
        state: 'DUPLICATE',
        ofIssueId: 'issue-1',
        onBehalfOf: 'it-1',
        bySubstitute: true,
      });
    });

    it('preserves REASON_REQUIRED, lock ordering by id, NOT_FOUND, DUPLICATE_TARGET_INVALID, and INVALID_TRANSITION', async () => {
      const h = createHarness();

      await expect(
        h.service.markDuplicate(principal('it-1'), 'issue-2', { ofIssueId: 'issue-1', reason: '   ' }),
      ).rejects.toMatchObject({ problem: 'REASON_REQUIRED' });

      h.lock.mockResolvedValue(null);
      await expect(
        h.service.markDuplicate(principal('it-1'), 'issue-b', { ofIssueId: 'issue-a', reason: 'Same' }),
      ).rejects.toMatchObject({ problem: 'NOT_FOUND' });
      expect(h.lock.mock.calls.map((c) => c[1])).toEqual(['issue-a', 'issue-b']);

      h.lock.mockReset();
      h.lock.mockImplementation((_tx: DbTx, id: string) =>
        Promise.resolve(id === 'issue-2' ? baseIssue({ id, state: 'NEW' }) : null),
      );
      await expect(
        h.service.markDuplicate(principal('it-1'), 'issue-2', { ofIssueId: 'issue-1', reason: 'Same' }),
      ).rejects.toMatchObject({ problem: 'DUPLICATE_TARGET_INVALID' });

      h.lock.mockImplementation((_tx: DbTx, id: string) =>
        Promise.resolve(baseIssue({ id, state: id === 'issue-2' ? 'RESOLVED' : 'NEW' })),
      );
      await expect(
        h.service.markDuplicate(principal('it-1'), 'issue-2', { ofIssueId: 'issue-1', reason: 'Same' }),
      ).rejects.toMatchObject({ problem: 'INVALID_TRANSITION' });
    });
  });
});
