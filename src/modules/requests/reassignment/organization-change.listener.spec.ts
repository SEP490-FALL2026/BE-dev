import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { OrganizationChangeListeners } from '../../organization/public/organization.extension-points';
import type { RequestDraftDepartureService } from '../draft/request-draft-departure.service';
import type { StepReassignmentRepo } from '../step-routing/step-reassignment.repo';
import type { DepartmentWithoutHeadNotice } from './department-without-head-notice.service';
import { RequestsOrganizationChangeListener } from './organization-change.listener';
import type { StepReassignmentService } from './step-reassignment.service';

describe('RequestsOrganizationChangeListener', () => {
  it('includes spendQueueRequestIdsOfDepartment on HEAD_PERIOD_END and notifies without-head handler', async () => {
    const tx = {} as unknown as DbTx;
    const repo = {
      needRequestIdsOfRequesters: jest.fn().mockResolvedValue(['req-member']),
      needRequestIdsOfDepartment: jest.fn().mockResolvedValue(['req-need']),
      spendQueueRequestIdsOfDepartment: jest.fn().mockResolvedValue(['req-queued']),
      waitingRequestIds: jest.fn().mockResolvedValue(['req-waiting']),
      lockIds: jest.fn().mockResolvedValue(undefined),
    };
    const reassignment = { reconcileRequests: jest.fn().mockResolvedValue(undefined) };
    const withoutHead = { tellIfLeftWithoutHead: jest.fn().mockResolvedValue(undefined) };
    const listener = new RequestsOrganizationChangeListener(
      repo as unknown as StepReassignmentRepo,
      reassignment as unknown as StepReassignmentService,
      { getDepartmentMemberIds: jest.fn().mockResolvedValue(['emp-1']) } as unknown as OrganizationReadApi,
      { deleteOf: jest.fn() } as unknown as RequestDraftDepartureService,
      withoutHead as unknown as DepartmentWithoutHeadNotice,
      { add: jest.fn() } as unknown as OrganizationChangeListeners,
    );

    const change = {
      id: 'chg-1',
      kind: 'HEAD_PERIOD_END' as const,
      departmentId: 'dept-1',
      periodId: 'period-1',
      headEmployeeId: 'head-1',
      effectiveOn: '2026-06-01',
    };
    await listener.onChange(tx, change);

    expect(repo.spendQueueRequestIdsOfDepartment).toHaveBeenCalledWith('dept-1', tx);
    expect(repo.lockIds).toHaveBeenCalledWith(tx, ['req-member', 'req-need', 'req-queued', 'req-waiting']);
    expect(reassignment.reconcileRequests).toHaveBeenCalledWith(
      tx,
      ['req-member', 'req-need', 'req-queued', 'req-waiting'],
      { kind: 'HEAD_CHANGED', employeeId: null },
      'chg-1',
      expect.any(Date),
    );
    expect(withoutHead.tellIfLeftWithoutHead).toHaveBeenCalledWith(tx, change, expect.any(Date));
  });
});
