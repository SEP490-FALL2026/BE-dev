import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import type { LicensingApi } from '../../licensing/public/licensing.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ActingItAdminsResult } from '../../organization/public/organization.types';
import type { GhostSeatDecisionRepo } from '../ghost-seat/ghost-seat-decision.repo';
import type { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import type { BoardQueryService } from './board-query.service';
import { BoardReclaimService, RECLAIM_DECIDED_ROLE, RECLAIM_REFERENCE_KIND } from './board-reclaim.service';
import { GhostSeatNotFoundError, GhostSeatNotInChargeError, GhostSeatNotReclaimableError } from './board.errors';
import { toGhostSeatApiException } from './board.http-errors';

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
    group: 'G2',
    state: 'OPEN',
    tier: 'ACTION',
    assignmentId: 'asg-1',
    employeeId: 'emp-holder',
    departmentId: 'dept-1',
    revocationTaskId: null,
    revocationNotBefore: null,
    ...over,
  }) as GhostSeatRecord;

function build(opts: {
  record?: GhostSeatRecord | null;
  orgId?: string | null;
  acting?: ActingItAdminsResult;
  taskStatus?: string;
  latestDecision?: { decidedByEmployeeId: string; reason: string } | null;
}) {
  const record = opts.record === undefined ? makeRecord() : opts.record;
  const acting: ActingItAdminsResult = opts.acting ?? {
    inCharge: 'emp-it',
    substitute: null,
    defaultAssignee: 'emp-it',
    actors: ['emp-it'],
  };
  const runner = {
    run: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
  } as unknown as TransactionRunner;
  const repo = {
    lock: jest.fn().mockResolvedValue(record),
    find: jest.fn().mockResolvedValue(record),
  } as unknown as GhostSeatRepo;
  const actingItAdminsFor = jest.fn().mockResolvedValue(acting);
  const markReclaimDecided = jest.fn().mockResolvedValue(undefined);
  const relinkTask = jest.fn().mockResolvedValue(undefined);
  const ghostSeats = { actingItAdminsFor, markReclaimDecided, relinkTask } as unknown as GhostSeatService;
  const openRevocation = jest.fn().mockResolvedValue({ taskId: 'task-new' });
  const licensing = { openRevocation } as unknown as LicensingApi;
  const organizationReads = {
    getOrganization: jest.fn().mockResolvedValue(opts.orgId === null ? null : { id: opts.orgId ?? ORG_ID }),
  } as unknown as OrganizationReadApi;
  const queries = {
    detailOf: jest.fn().mockResolvedValue({ id: record?.id ?? 'rec-1' }),
  } as unknown as BoardQueryService;
  const decisions = {
    latestReclaimOf: jest
      .fn()
      .mockResolvedValue(
        opts.latestDecision === undefined ? { decidedByEmployeeId: 'emp-head', reason: 'Unused' } : opts.latestDecision,
      ),
  } as unknown as GhostSeatDecisionRepo;
  const taskStandings = {
    getRevocationTaskStatuses: jest
      .fn()
      .mockResolvedValue(new Map([['task-old', { status: opts.taskStatus ?? 'CLOSED_FAILED' }]])),
  } as unknown as LicensingGhostSeatApi;

  const service = new BoardReclaimService(
    runner,
    repo,
    ghostSeats,
    licensing,
    organizationReads,
    queries,
    decisions,
    taskStandings,
  );

  return { service, actingItAdminsFor, markReclaimDecided, relinkTask, openRevocation };
}

describe('BoardReclaimService', () => {
  it('refuses non-acting IT Admin with GhostSeatNotInChargeError (403 GHOST_SEAT.NOT_IN_CHARGE) on open G2', async () => {
    const { service, openRevocation, markReclaimDecided } = build({
      acting: { inCharge: 'emp-owner', substitute: null, defaultAssignee: 'emp-owner', actors: ['emp-owner'] },
    });

    const error = await service.reclaim(actor, 'rec-1').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GhostSeatNotInChargeError);
    const apiErr = toGhostSeatApiException(error) as ApiException;
    expect(apiErr.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(apiErr.getResponse()).toMatchObject({ code: 'GHOST_SEAT.NOT_IN_CHARGE' });
    expect(openRevocation).not.toHaveBeenCalled();
    expect(markReclaimDecided).not.toHaveBeenCalled();
  });

  it('refuses non-acting IT Admin on G3/G4 reopen', async () => {
    const { service, openRevocation, relinkTask } = build({
      record: makeRecord({
        group: 'G4',
        state: 'RECLAIM_DECIDED',
        revocationTaskId: 'task-old',
      }),
      acting: { inCharge: null, substitute: null, defaultAssignee: null, actors: [] },
    });

    await expect(service.reclaim(actor, 'rec-1')).rejects.toBeInstanceOf(GhostSeatNotInChargeError);
    expect(openRevocation).not.toHaveBeenCalled();
    expect(relinkTask).not.toHaveBeenCalled();
  });

  it('allows usable in-charge IT Admin on G2 without bySubstitute', async () => {
    const record = makeRecord({ departmentId: null });
    const { service, actingItAdminsFor, markReclaimDecided, openRevocation } = build({
      record,
      acting: { inCharge: 'emp-it', substitute: null, defaultAssignee: 'emp-it', actors: ['emp-it'] },
    });

    await service.reclaim(actor, 'rec-1');

    expect(actingItAdminsFor).toHaveBeenCalledWith(TX, null, 'emp-holder');
    expect(openRevocation).toHaveBeenCalledWith(TX, actor, {
      assignmentId: 'asg-1',
      source: 'ABRUPT_DEPARTURE',
      decision: {
        decidedByEmployeeId: 'emp-it',
        decidedRole: RECLAIM_DECIDED_ROLE,
        referenceKind: RECLAIM_REFERENCE_KIND,
        referenceId: 'rec-1',
      },
    });
    expect(markReclaimDecided).toHaveBeenCalledWith(
      TX,
      record,
      'task-new',
      { kind: 'USER', principal: actor },
      true,
      false,
    );
  });

  it('allows appointed substitute on G2 and G3/G4 reopen with bySubstitute=true', async () => {
    const g2 = makeRecord();
    const subActing: ActingItAdminsResult = {
      inCharge: null,
      substitute: 'emp-it',
      defaultAssignee: 'emp-it',
      actors: ['emp-it'],
    };
    const g2Ctx = build({ record: g2, acting: subActing });
    await g2Ctx.service.reclaim(actor, 'rec-1');
    expect(g2Ctx.markReclaimDecided).toHaveBeenCalledWith(
      TX,
      g2,
      'task-new',
      { kind: 'USER', principal: actor },
      false,
      true,
    );

    const g4 = makeRecord({ group: 'G4', state: 'RECLAIM_DECIDED', revocationTaskId: 'task-old' });
    const g4Ctx = build({ record: g4, acting: subActing, taskStatus: 'CLOSED_FAILED' });
    await g4Ctx.service.reclaim(actor, 'rec-1');
    expect(g4Ctx.relinkTask).toHaveBeenCalledWith(TX, g4, 'task-new', { kind: 'USER', principal: actor }, true);
  });

  it('preserves existing guards (NOT_FOUND, G1/not-reclaimable, live task on G3/G4 reopen)', async () => {
    await expect(build({ record: null }).service.reclaim(actor, 'rec-1')).rejects.toBeInstanceOf(
      GhostSeatNotFoundError,
    );
    await expect(
      build({
        record: makeRecord({ group: 'G1', departmentId: null, employeeId: null, assignmentId: null }),
      }).service.reclaim(actor, 'rec-1'),
    ).rejects.toBeInstanceOf(GhostSeatNotReclaimableError);
    await expect(
      build({ record: makeRecord({ state: 'CLOSED' }) }).service.reclaim(actor, 'rec-1'),
    ).rejects.toBeInstanceOf(GhostSeatNotReclaimableError);
    await expect(
      build({
        record: makeRecord({ group: 'G3', state: 'RECLAIM_DECIDED', revocationTaskId: 'task-old' }),
        taskStatus: 'QUEUED',
      }).service.reclaim(actor, 'rec-1'),
    ).rejects.toBeInstanceOf(GhostSeatNotReclaimableError);
  });
});
