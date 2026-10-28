import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';
import { SpendEffectsService } from '../spend/spend-effects.service';
import type { SpendStepRecord } from '../spend/spend-step.repo';
import { spendLineState, stepRefusalReason, type LineVerdict } from './group-line-decision.policy';
import { pricedPeople } from './group-request.types';
import { GroupResolutionService } from './group-resolution.service';
import { scaleSchedule, sharesOf } from './line-allocation.policy';
import { LineAmountRepo } from './line-amount.repo';
import { LineDecisionRepo } from './line-decision.repo';
import { RequestLineRepo } from './request-line.repo';
import { RequestOutcomeListeners } from '../access-request/request-outcome-listeners';

export interface SpendRecordInput {
  step: SpendStepRecord;
  verdicts: readonly LineVerdict[];
  checkId: string | null;
  override: { reason: string; years: readonly number[] } | null;
  now: Date;
}

/**
 * Writes a spend decision taken on the lines of a group (`US-05-17` AC-9, `US-06-01` AC-15): one record of the step, one decision for
 * each person, the line of each person, and, for the people approved, one commitment for each year with the share of each person in
 * it. The request is then made again for the people who were approved, so that what it says it costs is what is held.
 */
@Injectable()
export class GroupSpendRecordService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly decisions: SpendDecisionRepo,
    private readonly lineDecisions: LineDecisionRepo,
    private readonly lines: RequestLineRepo,
    private readonly amounts: LineAmountRepo,
    private readonly effects: SpendEffectsService,
    private readonly resolution: GroupResolutionService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
    private readonly outcomes: RequestOutcomeListeners,
  ) {}

  /** Records the decision: approved when somebody goes on, refused, with no commitment, when nobody does. */
  async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    input: SpendRecordInput,
  ): Promise<{ requestState: string }> {
    const { step, verdicts, now } = input;
    const approved = verdicts.filter((verdict) => verdict.decision === 'APPROVE');
    const outcome = approved.length > 0 ? ('APPROVED' as const) : ('REJECTED' as const);
    const holders = await this.identity.getApprovalRoleHolders(tx);
    const deciderRole =
      holders.conflictSubstituteEmployeeId === actor.employeeId ? 'CONFLICT_SUBSTITUTE' : 'SPENDING_APPROVER';

    await this.decisions.record(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      stepId: step.id,
      departmentId: request.departmentId,
      decision: outcome,
      deciderRole,
      reason: outcome === 'REJECTED' ? stepRefusalReason(verdicts) : null,
      checkId: input.checkId,
      overrideReason: input.override?.reason ?? null,
      overrideYears: input.override?.years ?? [],
      decidedByEmployeeId: actor.employeeId,
      decidedAt: now,
      requestState: outcome === 'APPROVED' ? 'AWAITING_EXECUTION' : 'REJECTED',
    });
    await this.lineDecisions.insertMany(
      tx,
      verdicts.map((verdict) => ({
        requestId: request.id,
        employeeId: verdict.employeeId,
        stage: 'SPEND' as const,
        stepId: step.id,
        decision: verdict.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const),
        reason: verdict.decision === 'REJECT' ? (verdict.reason ?? '').trim() : null,
        decidedByEmployeeId: actor.employeeId,
        deciderRole,
        decidedAt: now,
      })),
    );
    for (const verdict of verdicts) {
      const rejected = verdict.decision === 'REJECT';
      await this.lines.move(tx, request.id, verdict.employeeId, {
        state: spendLineState(verdict.decision),
        ...(rejected
          ? { endedAt: now, endedByEmployeeId: actor.employeeId, endReason: (verdict.reason ?? '').trim() }
          : {}),
      });
    }
    if (outcome === 'APPROVED') await this.holdForApproved(tx, actor, request, approved, input);
    await this.report(tx, actor, request, input, deciderRole, outcome);

    const { request: after } = await this.resolution.resolve(tx, actor, request.id, now);

    return { requestState: after.state };
  }

  /** One commitment for each year, the sum of the part of the people approved, and what each of them stands for in it. */
  private async holdForApproved(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    approved: readonly LineVerdict[],
    input: SpendRecordInput,
  ): Promise<void> {
    const check = await this.effects.hold(tx, actor, request, input.checkId, input.now);
    const costs = check.years
      .filter((year) => year.code !== null)
      .map((year) => ({ year: year.year, amountMinor: year.costMinor }));
    await this.amounts.insertMany(
      tx,
      approved.flatMap((verdict, index) =>
        sharesOf(costs, approved.length, index).map((share) => ({
          requestId: request.id,
          employeeId: verdict.employeeId,
          budgetYear: share.year,
          amountMinor: share.amountMinor,
          currency: check.currency,
        })),
      ),
    );

    // What the request costs is now what the people approved cost, in the currency of the price.
    const { pricing } = request;
    const priced = pricedPeople(request.lines.map((line) => line.state));
    const scaled = pricing.schedule === null ? null : scaleSchedule(pricing.schedule, priced, approved.length);
    if (scaled !== null && pricing.amount !== null && approved.length !== priced) {
      await this.requests.setPricing(tx, request.id, {
        ...pricing,
        amount: {
          amountMinor: scaled.reduce((sum, period) => sum + period.amountMinor, 0n),
          currency: pricing.amount.currency,
        },
        schedule: scaled,
      });
    }
  }

  private async report(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    input: SpendRecordInput,
    deciderRole: string,
    outcome: 'APPROVED' | 'REJECTED',
  ): Promise<void> {
    const { step, verdicts } = input;
    for (const verdict of verdicts) {
      const rejected = verdict.decision === 'REJECT';
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.LINE_SPEND_DECIDED',
          'ACCESS_REQUEST_STEP',
          step.id,
          {
            requestId: request.id,
            stepId: step.id,
            beneficiaryEmployeeId: verdict.employeeId,
            decision: rejected ? 'REJECTED' : 'APPROVED',
            decidedByEmployeeId: actor.employeeId,
            deciderRole,
            reason: rejected ? (verdict.reason ?? '').trim() : null,
            requesterEmployeeId: request.requesterEmployeeId,
          },
        ),
      );
      // The line of a person whose spend was refused ended for them without a grant (F43).
      if (rejected) await this.outcomes.ended(tx, request, [verdict.employeeId], input.now);
    }
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        outcome === 'APPROVED' ? 'ACCESS_REQUEST.SPEND_APPROVED' : 'ACCESS_REQUEST.SPEND_REJECTED',
        'ACCESS_REQUEST_STEP',
        step.id,
        {
          requestId: request.id,
          checkId: input.checkId,
          decision: outcome,
          deciderRole,
          override: input.override !== null,
          overrideYears: (input.override?.years ?? []).join(','),
          samePersonAsSpend: step.samePersonAsSpend,
          noIndependentReview: step.noIndependentReview,
          requestState: outcome === 'APPROVED' ? 'AWAITING_EXECUTION' : 'REJECTED',
          lineCount: verdicts.length,
          approvedEmployeeIds: verdicts
            .filter((verdict) => verdict.decision === 'APPROVE')
            .map((verdict) => verdict.employeeId),
          rejectedEmployeeIds: verdicts
            .filter((verdict) => verdict.decision === 'REJECT')
            .map((verdict) => verdict.employeeId),
        },
      ),
    );
  }
}
