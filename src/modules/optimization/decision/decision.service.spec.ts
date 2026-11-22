import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import type { GhostSeatDecisionRepo } from '../ghost-seat/ghost-seat-decision.repo';
import type { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import type { DecisionReclaimService } from './decision-reclaim.service';
import type { DecisionTransferService } from './decision-transfer.service';
import { DecisionService } from './decision.service';

describe('DecisionService batch reclaim processing order', () => {
  const tx = { kind: 'tx' };
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const actor = {
    employeeId: 'head-1',
    appUserId: 'user-head-1',
    roles: ['DEPARTMENT_HEAD'],
  } as unknown as AuthenticatedPrincipal;

  const makeRecord = (id: string): GhostSeatRecord =>
    ({
      id,
      organizationId: 'org-1',
      state: 'AWAITING_DECISION',
      deciderDepartmentId: 'dept-1',
      employeeId: 'emp-other',
      seatChainId: `chain-${id}`,
    }) as unknown as GhostSeatRecord;

  const makeSeat = (id: string, subscriptionId: string, assignmentId: string): RuleSeat =>
    ({
      assignmentId,
      subscriptionId,
      expectedEndDate: null,
      recommendationId: id,
    }) as unknown as RuleSeat;

  beforeEach(() => jest.clearAllMocks());

  it('processes RECLAIM in (subscriptionId, assignmentId, id) order while returning outcomes in input ids order', async () => {
    const openedOrder: string[] = [];
    const recs = new Map<string, GhostSeatRecord>([
      ['rec-1', makeRecord('rec-1')],
      ['rec-2', makeRecord('rec-2')],
      ['rec-3', makeRecord('rec-3')],
    ]);
    const seats = new Map<string, RuleSeat>([
      ['rec-1', makeSeat('rec-1', 'sub-B', 'asg-2')],
      ['rec-2', makeSeat('rec-2', 'sub-A', 'asg-2')],
      ['rec-3', makeSeat('rec-3', 'sub-A', 'asg-1')],
    ]);

    const service = new DecisionService(
      runner,
      { lockMany: jest.fn(() => Promise.resolve(recs)) } as unknown as GhostSeatRepo,
      { insertDecision: jest.fn(() => Promise.resolve({ id: 'dec-1' })) } as unknown as GhostSeatDecisionRepo,
      { transition: jest.fn() } as unknown as GhostSeatService,
      {
        getOrganization: jest.fn(() => Promise.resolve({ id: 'org-1' })),
        businessToday: jest.fn(() => Promise.resolve('2026-11-23')),
        getHeadedDepartment: jest.fn(() => Promise.resolve({ departmentId: 'dept-1' })),
      } as unknown as OrganizationReadApi,
      { pauseIfTransferred: jest.fn() } as unknown as DecisionTransferService,
      {
        openSeatsOf: jest.fn(() => Promise.resolve(seats)),
        graceDays: jest.fn(() => Promise.resolve(7)),
        open: jest.fn((_tx: unknown, _actor: unknown, record: GhostSeatRecord) => {
          openedOrder.push(record.id);
          return Promise.resolve({ taskId: `task-${record.id}`, notBefore: '2026-11-30' });
        }),
      } as unknown as DecisionReclaimService,
      {
        judge: jest.fn(() => Promise.resolve({ verdict: 'OK' })),
        record: jest.fn(),
      } as unknown as PolicyChecklistApi,
    );

    const outcomes = await service.decide(
      actor,
      {
        recommendationIds: ['rec-2', 'rec-1', 'rec-3'],
        choice: 'RECLAIM',
        reason: 'Unused seat',
        checklist: { versionId: 'v1', answers: [] } as never,
      },
      new Date('2026-11-23T00:00:00Z'),
    );

    expect(openedOrder).toEqual(['rec-3', 'rec-2', 'rec-1']);
    expect(outcomes.map((o) => o.recommendationId)).toEqual(['rec-1', 'rec-2', 'rec-3']);
  });
});
