import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import type { DecisionFollowUpService } from '../decision/decision-follow-up.service';
import type { DecisionRoutingService } from '../decision/decision-routing.service';
import type { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import type { EscalationFactsService } from './escalation-facts.service';
import { GhostSeatEscalationKeyReusedError } from './escalation.errors';
import { toEscalationApiException } from './escalation.http-errors';
import { EscalationService } from './escalation.service';

const actor = {
  appUserId: 'u-it',
  employeeId: 'e-it',
  sessionId: 's-1',
  subject: 'u-it',
  roles: ['IT_ADMIN'],
  directRoles: ['IT_ADMIN'],
} as unknown as AuthenticatedPrincipal;

const watchRecord: GhostSeatRecord = {
  id: 'rec-1',
  organizationId: 'org-1',
  group: 'G4',
  tier: 'MONITOR',
  state: 'OPEN',
  employeeId: 'e-holder',
  seatChainId: 'chain-1',
} as unknown as GhostSeatRecord;

describe('EscalationService', () => {
  const build = (access: { allowed: boolean; byInCharge: boolean; bySubstitute: boolean }) => {
    const tx = {};
    const findByKey = jest.fn().mockResolvedValue(null);
    const claim = jest.fn().mockResolvedValue('esc-1');
    const saveResults = jest.fn().mockResolvedValue(undefined);
    const lockMany = jest.fn().mockResolvedValue(new Map([['rec-1', watchRecord]]));
    const raiseTierEarly = jest.fn().mockResolvedValue({ ...watchRecord, tier: 'REVIEW' });
    const enterQueue = jest.fn().mockResolvedValue({ state: 'AWAITING_DECISION' });
    const dayOf = jest.fn().mockResolvedValue({ organizationId: 'org-1', today: '2026-11-23' });
    const ofBatch = jest.fn().mockResolvedValue({
      seats: new Map([['chain-1', { isMachineAccount: false }]]),
      inTransfer: new Set(),
      leaveOrHandover: new Set(),
      placements: new Map([['e-holder', 'dep-1']]),
    });
    const of = jest.fn().mockReturnValue({
      record: watchRecord,
      seat: { isMachineAccount: false },
      inTransfer: false,
      onLeaveOrHandover: false,
      placementDepartmentId: 'dep-1',
    });
    const departmentAccessOf = jest.fn().mockResolvedValue(access);
    const judge = jest.fn().mockResolvedValue({ verdict: { policyVersionId: 'pv-1' } });
    const recordChecklist = jest.fn().mockResolvedValue(undefined);
    const runner = {
      run: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as TransactionRunner;

    const service = new EscalationService(
      runner,
      { findByKey, claim, saveResults },
      { lockMany } as unknown as GhostSeatRepo,
      { raiseTierEarly } as unknown as GhostSeatService,
      { enterQueue } as unknown as DecisionRoutingService,
      { dayOf } as unknown as DecisionFollowUpService,
      { ofBatch, of, departmentAccessOf } as unknown as EscalationFactsService,
      { judge, record: recordChecklist } as unknown as PolicyChecklistApi,
    );

    return { service, findByKey, raiseTierEarly, recordChecklist, tx };
  };

  it('skips with NOT_IN_CHARGE when departmentAccessOf refuses the caller', async () => {
    const { service, raiseTierEarly, recordChecklist, tx } = build({
      allowed: false,
      byInCharge: false,
      bySubstitute: false,
    });

    const outcome = await service.escalate(actor, {
      recommendationIds: ['rec-1'],
      checklist: { policyVersionId: 'pv-1', answers: [] },
      idempotencyKey: 'key-1234567890123456',
    });

    expect(outcome.results).toEqual([{ recommendationId: 'rec-1', outcome: 'SKIPPED', reason: 'NOT_IN_CHARGE' }]);
    expect(raiseTierEarly).not.toHaveBeenCalled();
    expect(recordChecklist).not.toHaveBeenCalled();
    expect(tx).toBeDefined();
  });

  it('audits byInCharge=true without bySubstitute when the in-charge IT Admin escalates', async () => {
    const { service, raiseTierEarly, recordChecklist, tx } = build({
      allowed: true,
      byInCharge: true,
      bySubstitute: false,
    });

    const outcome = await service.escalate(actor, {
      recommendationIds: ['rec-1'],
      note: 'Check',
      checklist: { policyVersionId: 'pv-1', answers: [] },
      idempotencyKey: 'key-1234567890123456',
    });

    expect(outcome.results).toEqual([
      { recommendationId: 'rec-1', outcome: 'ESCALATED', state: 'AWAITING_DECISION', departmentId: 'dep-1' },
    ]);
    expect(raiseTierEarly).toHaveBeenCalledWith(
      tx,
      watchRecord,
      { kind: 'USER', principal: actor },
      {
        escalationId: 'esc-1',
        departmentId: 'dep-1',
        hasNote: true,
        byInCharge: true,
      },
    );
    expect(recordChecklist).toHaveBeenCalledTimes(1);
  });

  it('audits byInCharge=false and bySubstitute=true when an appointed substitute escalates', async () => {
    const { service, raiseTierEarly, tx } = build({
      allowed: true,
      byInCharge: false,
      bySubstitute: true,
    });

    const outcome = await service.escalate(actor, {
      recommendationIds: ['rec-1'],
      checklist: { policyVersionId: 'pv-1', answers: [] },
      idempotencyKey: 'key-1234567890123456',
    });

    expect(outcome.results).toEqual([
      { recommendationId: 'rec-1', outcome: 'ESCALATED', state: 'AWAITING_DECISION', departmentId: 'dep-1' },
    ]);
    expect(raiseTierEarly).toHaveBeenCalledWith(
      tx,
      watchRecord,
      { kind: 'USER', principal: actor },
      {
        escalationId: 'esc-1',
        departmentId: 'dep-1',
        hasNote: false,
        byInCharge: false,
        bySubstitute: true,
      },
    );
  });

  it('throws GhostSeatEscalationKeyReusedError mapped to 409 GHOST_SEAT.ESCALATION_KEY_REUSED on hash mismatch', async () => {
    const { service, findByKey } = build({ allowed: true, byInCharge: true, bySubstitute: false });
    findByKey.mockResolvedValue({
      id: 'esc-old',
      requestHash: 'different-hash',
      results: [],
    });

    const error = await service
      .escalate(actor, {
        recommendationIds: ['rec-1'],
        checklist: { policyVersionId: 'pv-1', answers: [] },
        idempotencyKey: 'key-1234567890123456',
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GhostSeatEscalationKeyReusedError);
    const apiErr = toEscalationApiException(error) as ApiException;
    expect(apiErr.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(apiErr.getResponse()).toMatchObject({ code: 'GHOST_SEAT.ESCALATION_KEY_REUSED' });
  });
});
