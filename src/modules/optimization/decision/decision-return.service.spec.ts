import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { LicensingApi } from '../../licensing/public/licensing.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ActingItAdminsResult } from '../../organization/public/organization.types';
import type { GhostSeatDecisionRepo } from '../ghost-seat/ghost-seat-decision.repo';
import type { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import type { DecisionFollowUpService } from './decision-follow-up.service';
import { DECISION_REFERENCE_KIND } from './decision-reclaim.service';
import { DecisionReturnService } from './decision-return.service';
import {
  GhostSeatAlreadyReturnedError,
  GhostSeatDecisionNotFoundError,
  GhostSeatDecisionNotInChargeError,
  GhostSeatNotReturnableError,
  GhostSeatTaskInProgressError,
} from './decision.errors';
import { toDecisionApiException } from './decision.http-errors';

const TX = { tx: true };
const ORG_ID = 'org-1';
const actor: AuthenticatedPrincipal = {
  appUserId: 'user-it',
  employeeId: 'emp-it',
  sessionId: 'sess-1',
  subject: 'user-it',
  roles: ['IT_ADMIN'],
  directRoles: ['IT_ADMIN'],
};

const makeRecord = (over: Partial<GhostSeatRecord> = {}): GhostSeatRecord =>
  ({
    id: 'rec-1',
    organizationId: ORG_ID,
    group: 'G4',
    state: 'RECLAIM_DECIDED',
    tier: 'ACTION',
    applicationId: 'app-1',
    assignmentId: 'asg-1',
    employeeId: 'emp-holder',
    departmentId: null,
    deciderDepartmentId: 'dept-1',
    revocationTaskId: 'task-1',
    returnCount: 0,
    ...over,
  }) as GhostSeatRecord;

function build(opts: {
  record?: GhostSeatRecord | null;
  acting?: ActingItAdminsResult;
  withdrawn?: { outcome: string; taskId?: string | null };
}) {
  const record = opts.record === undefined ? makeRecord() : opts.record;
  const acting: ActingItAdminsResult = opts.acting ?? {
    inCharge: 'emp-it',
    substitute: null,
    defaultAssignee: 'emp-it',
    actors: ['emp-it'],
  };
  const updated = { ...record, state: 'RETURNED_TO_HEAD', returnCount: 1, decisionDueOn: '2026-11-30' };
  const runner = {
    run: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
  } as unknown as TransactionRunner;
  const repo = { lock: jest.fn().mockResolvedValue(record) } as unknown as GhostSeatRepo;
  const decisions = { insertReturn: jest.fn().mockResolvedValue(undefined) } as unknown as GhostSeatDecisionRepo;
  const actingItAdminsFor = jest.fn().mockResolvedValue(acting);
  const transition = jest.fn().mockResolvedValue(updated);
  const ghostSeats = { actingItAdminsFor, transition } as unknown as GhostSeatService;
  const withdrawRevocationReason = jest
    .fn()
    .mockResolvedValue(opts.withdrawn ?? { outcome: 'CANCELLED', taskId: 'task-1' });
  const licensing = { withdrawRevocationReason } as unknown as LicensingApi;
  const organizationReads = {
    getDepartmentHeads: jest.fn().mockResolvedValue(new Map([['dept-1', { employeeId: 'emp-head' }]])),
  } as unknown as OrganizationReadApi;
  const notifications = {
    notifyInApp: jest.fn().mockResolvedValue(undefined),
    holdForDepartment: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsApi;
  const followUp = {
    dayOf: jest.fn().mockResolvedValue({
      organizationId: ORG_ID,
      today: '2026-11-23',
      workingDays: 5,
      nonWorking: new Set<string>(),
      now: new Date('2026-11-23T03:00:00Z'),
    }),
  } as unknown as DecisionFollowUpService;

  const service = new DecisionReturnService(
    runner,
    repo,
    decisions,
    ghostSeats,
    licensing,
    organizationReads,
    notifications,
    followUp,
  );

  return { service, actingItAdminsFor, transition, withdrawRevocationReason };
}

describe('DecisionReturnService', () => {
  it('refuses non-acting IT Admin with GhostSeatDecisionNotInChargeError (403 GHOST_SEAT.NOT_IN_CHARGE)', async () => {
    const { service, withdrawRevocationReason, transition } = build({
      acting: { inCharge: 'emp-owner', substitute: null, defaultAssignee: 'emp-owner', actors: ['emp-owner'] },
    });

    const error = await service.returnToHead(actor, 'rec-1', 'Reason').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GhostSeatDecisionNotInChargeError);
    const apiErr = toDecisionApiException(error) as ApiException;
    expect(apiErr.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(apiErr.getResponse()).toMatchObject({ code: 'GHOST_SEAT.NOT_IN_CHARGE' });
    expect(withdrawRevocationReason).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it('allows usable in-charge IT Admin without bySubstitute', async () => {
    const record = makeRecord({ departmentId: 'dept-holder', deciderDepartmentId: 'dept-1' });
    const { service, actingItAdminsFor, transition } = build({
      record,
      acting: { inCharge: 'emp-it', substitute: null, defaultAssignee: 'emp-it', actors: ['emp-it'] },
    });

    await service.returnToHead(actor, 'rec-1', 'Cannot remove yet');

    expect(actingItAdminsFor).toHaveBeenCalledWith(TX, 'dept-holder', 'emp-holder', '2026-11-23');
    expect(transition).toHaveBeenCalledWith(
      TX,
      record,
      'RETURNED_TO_HEAD',
      expect.any(Object),
      'GHOST_SEAT.RETURNED',
      { kind: 'USER', principal: actor },
      { byInCharge: true, taskOutcome: 'CANCELLED', referenceKind: DECISION_REFERENCE_KIND },
    );
  });

  it('allows appointed substitute with byInCharge=false and bySubstitute=true', async () => {
    const record = makeRecord({ departmentId: 'dept-holder', deciderDepartmentId: 'dept-1' });
    const { service, actingItAdminsFor, transition } = build({
      record,
      acting: { inCharge: null, substitute: 'emp-it', defaultAssignee: 'emp-it', actors: ['emp-it'] },
    });

    await service.returnToHead(actor, 'rec-1', 'Cannot remove yet');

    expect(actingItAdminsFor).toHaveBeenCalledWith(TX, 'dept-holder', 'emp-holder', '2026-11-23');
    expect(transition).toHaveBeenCalledWith(
      TX,
      record,
      'RETURNED_TO_HEAD',
      expect.any(Object),
      'GHOST_SEAT.RETURNED',
      { kind: 'USER', principal: actor },
      { byInCharge: false, bySubstitute: true, taskOutcome: 'CANCELLED', referenceKind: DECISION_REFERENCE_KIND },
    );
  });

  it('passes record.departmentId (null) rather than deciderDepartmentId when record.departmentId is null', async () => {
    const record = makeRecord({ departmentId: null, deciderDepartmentId: 'dept-decider' });
    const denied = build({
      record,
      acting: { inCharge: null, substitute: null, defaultAssignee: null, actors: [] },
    });

    const error = await denied.service.returnToHead(actor, 'rec-1', 'Cannot remove yet').catch((err: unknown) => err);
    expect(denied.actingItAdminsFor).toHaveBeenCalledWith(TX, null, 'emp-holder', '2026-11-23');
    expect(error).toBeInstanceOf(GhostSeatDecisionNotInChargeError);
    const apiErr = toDecisionApiException(error) as ApiException;
    expect(apiErr.getResponse()).toMatchObject({ code: 'GHOST_SEAT.NOT_IN_CHARGE' });

    const allowed = build({
      record,
      acting: { inCharge: null, substitute: 'emp-it', defaultAssignee: 'emp-it', actors: ['emp-it'] },
    });
    await allowed.service.returnToHead(actor, 'rec-1', 'Cannot remove yet');
    expect(allowed.actingItAdminsFor).toHaveBeenCalledWith(TX, null, 'emp-holder', '2026-11-23');
  });

  it('preserves existing guards (NOT_FOUND, ALREADY_RETURNED, NOT_RETURNABLE, TASK_IN_PROGRESS)', async () => {
    await expect(build({ record: null }).service.returnToHead(actor, 'rec-1', 'R')).rejects.toBeInstanceOf(
      GhostSeatDecisionNotFoundError,
    );
    await expect(
      build({ record: makeRecord({ returnCount: 1 }) }).service.returnToHead(actor, 'rec-1', 'R'),
    ).rejects.toBeInstanceOf(GhostSeatAlreadyReturnedError);
    await expect(
      build({ record: makeRecord({ group: 'G2' }) }).service.returnToHead(actor, 'rec-1', 'R'),
    ).rejects.toBeInstanceOf(GhostSeatNotReturnableError);
    await expect(
      build({ withdrawn: { outcome: 'IT_ADMIN_TO_CLOSE', taskId: 'task-1' } }).service.returnToHead(
        actor,
        'rec-1',
        'R',
      ),
    ).rejects.toBeInstanceOf(GhostSeatTaskInProgressError);
  });
});
