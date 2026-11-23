import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import type { UsableItAdmins } from '../../organization/public/organization.types';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { InternalRulesG2Service } from './internal-rules-g2.service';
import type { RulePass } from './internal-rules.types';

interface NoticeCall {
  organizationId: string;
  recipientEmployeeId: string;
  code: string;
  subject: { type: string; id: string };
  params: Record<string, unknown>;
  eventKey: string;
}

const makeSeat = (overrides: Partial<RuleSeat> = {}): RuleSeat => ({
  assignmentId: 'assign-1',
  chainRootId: 'chain-1',
  kind: 'PERSONAL',
  isMachineAccount: false,
  planId: 'plan-1',
  applicationId: 'app-1',
  subscriptionId: 'sub-1',
  owningDepartmentId: 'dept-1',
  provisioningType: 'K2',
  pricingModel: 'PER_SEAT',
  employeeId: 'emp-leaver',
  expectedEndDate: null,
  liveRevocation: null,
  terminatingUntil: null,
  ...overrides,
});

const makeCreated = (id = 'rec-1'): GhostSeatRecord => ({
  id,
  organizationId: 'org-1',
  group: 'G2',
  state: 'OPEN',
  tier: 'ACTION',
  applicationId: 'app-1',
  planId: 'plan-1',
  subscriptionId: 'sub-1',
  assignmentId: 'assign-1',
  seatChainId: 'chain-1',
  employeeId: 'emp-leaver',
  departmentId: 'dept-1',
  freeSeats: null,
  countsTowardVacantCost: null,
  revocationTaskId: null,
  evidence: {
    group: 'G2',
    employeeId: 'emp-leaver',
    leftOn: null,
    planId: 'plan-1',
    provisioningType: 'K2',
    terminatingAccess: null,
  },
  deciderDepartmentId: null,
  routedAt: null,
  decisionDueOn: null,
  overdueNoticedAt: null,
  returnCount: 0,
  revocationNotBefore: null,
  pausedAt: null,
  pauseTransferId: null,
  usage: null,
  activityAfterDecisionOn: null,
  holderLeftOn: null,
  closeReason: null,
  closedByAppUserId: null,
  supersededById: null,
  closedAt: null,
  createdRunId: 'run-1',
  createdAt: new Date('2026-10-20T00:00:00Z'),
  updatedAt: new Date('2026-10-20T00:00:00Z'),
});

function harness(options: {
  lastDepartmentId?: string | null;
  owningDepartmentId?: string | null;
  acting?: { actors: string[]; substitute: string | null } | undefined;
  superAdminId?: string | null;
}) {
  const tx = { tag: 'tx' } as unknown as DbTx;
  const seat = makeSeat({
    owningDepartmentId: options.owningDepartmentId === undefined ? 'dept-1' : options.owningDepartmentId,
  });
  const runner = { run: jest.fn((work: (t: DbTx) => Promise<void>) => work(tx)) };
  const licensing = {
    listSeatsForRules: jest.fn().mockResolvedValue([seat]),
    getRevocationTaskStatuses: jest.fn().mockResolvedValue(new Map()),
  };
  const resolvedDept = options.lastDepartmentId !== undefined ? options.lastDepartmentId : seat.owningDepartmentId;
  const actingMap = resolvedDept && options.acting ? new Map([[resolvedDept, options.acting]]) : new Map();
  const organizationReads = {
    getEmployees: jest.fn().mockResolvedValue([{ id: seat.employeeId, status: 'TERMINATED' }]),
    getLastPlacement: jest
      .fn()
      .mockResolvedValue(options.lastDepartmentId ? { departmentId: options.lastDepartmentId } : null),
    itAdminsActingFor: jest.fn().mockImplementation(async (_depts: string[], usableAmong: UsableItAdmins) => {
      await usableAmong(['emp-incharge']);
      return actingMap;
    }),
  };
  const notifyInApp = jest.fn<Promise<boolean>, [DbTx, NoticeCall]>().mockResolvedValue(true);
  const repo = { unclosedOfSeats: jest.fn().mockResolvedValue([]) };
  const ghostSeats = { create: jest.fn().mockResolvedValue(makeCreated()) };
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['emp-incharge'])),
    findUsableSuperAdminEmployeeId: jest
      .fn()
      .mockResolvedValue(options.superAdminId === undefined ? 'emp-sa' : options.superAdminId),
  };

  const service = new InternalRulesG2Service(
    runner as never,
    licensing as never,
    organizationReads as never,
    { notifyInApp } as never,
    repo as never,
    ghostSeats as never,
    identity as never,
  );

  const pass: RulePass = {
    organizationId: 'org-1',
    today: '2026-10-21',
    now: new Date('2026-10-21T00:00:00Z'),
    tally: {
      run: { id: 'run-1' },
      skip: jest.fn(),
      created: jest.fn(),
      closed: jest.fn(),
      failed: jest.fn(),
    } as never,
  };

  return { tx, service, pass, notifyInApp, organizationReads, identity };
}

describe('InternalRulesG2Service notification recipients', () => {
  it('notifies usable in-charge IT Admin for open G2', async () => {
    const { tx, service, pass, notifyInApp, identity } = harness({
      lastDepartmentId: 'dept-1',
      acting: { actors: ['emp-incharge'], substitute: null },
    });

    await service.pass(pass);

    expect(identity.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifyInApp).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-incharge',
      code: 'GHOST_SEAT_G2_DETECTED',
      subject: { type: 'GHOST_SEAT_RECOMMENDATION', id: 'rec-1' },
      params: { recommendationId: 'rec-1', employeeId: 'emp-leaver', applicationId: 'app-1' },
      eventKey: 'GHOST_SEAT_G2:rec-1',
    });
  });

  it('notifies active substitute alongside in-charge, or substitute alone when in-charge is locked', async () => {
    const both = harness({
      lastDepartmentId: 'dept-1',
      acting: { actors: ['emp-incharge', 'emp-sub'], substitute: 'emp-sub' },
    });
    await both.service.pass(both.pass);
    expect(both.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-incharge', 'emp-sub']);

    const subOnly = harness({
      lastDepartmentId: 'dept-1',
      acting: { actors: ['emp-sub'], substitute: 'emp-sub' },
    });
    await subOnly.service.pass(subOnly.pass);
    expect(subOnly.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sub']);
  });

  it('notifies only Super Admin when in-charge IT Admin is locked and no substitute exists', async () => {
    const { tx, service, pass, notifyInApp, identity } = harness({
      lastDepartmentId: 'dept-1',
      acting: { actors: [], substitute: null },
      superAdminId: 'emp-sa',
    });

    await service.pass(pass);

    expect(identity.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(tx);
    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);
  });

  it('notifies Super Admin when departmentId is null', async () => {
    const { tx, service, pass, notifyInApp, organizationReads, identity } = harness({
      lastDepartmentId: null,
      owningDepartmentId: null,
      superAdminId: 'emp-sa',
    });

    await service.pass(pass);

    expect(organizationReads.itAdminsActingFor).not.toHaveBeenCalled();
    expect(identity.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(tx);
    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);
  });
});
