import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { spendLineState, stepRefusalReason, type LineVerdict } from '../group-request/group-line-decision.policy';
import { GroupResolutionService } from '../group-request/group-resolution.service';
import { LineDecisionRepo } from '../group-request/line-decision.repo';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';
import type { SpendStepRecord } from '../spend/spend-step.repo';
import { GroupSpendHold } from './group-spend-hold.service';
import { GroupSpendReport } from './group-spend-report.service';

export interface SpendRecordInput {
  step: SpendStepRecord;
  verdicts: readonly LineVerdict[];
  checkId: string | null;
  /** The check the approval is on needs the reserve, and the line of reason the head gave when they confirmed it. */
  usesReserve: boolean;
  reserveReason: string | null;
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
    private readonly decisions: SpendDecisionRepo,
    private readonly lineDecisions: LineDecisionRepo,
    private readonly lines: RequestLineRepo,
    private readonly resolution: GroupResolutionService,
    private readonly holds: GroupSpendHold,
    private readonly reports: GroupSpendReport,
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
    // Nobody decides in the place of the spending approver (`QĐ-93c`): the role is theirs.
    const deciderRole = 'SPENDING_APPROVER' as const;

    await this.decisions.record(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      stepId: step.id,
      departmentId: request.departmentId,
      decision: outcome,
      deciderRole,
      reason: outcome === 'REJECTED' ? stepRefusalReason(verdicts) : null,
      checkId: input.checkId,
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
    if (outcome === 'APPROVED') await this.holds.hold(tx, actor, request, approved, { checkId: input.checkId, now });
    await this.reports.report(tx, actor, request, { ...input, deciderRole, outcome });

    const { request: after } = await this.resolution.resolve(tx, actor, request.id, now);

    return { requestState: after.state };
  }
}
