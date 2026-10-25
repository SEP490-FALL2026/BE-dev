import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { toDateColumn } from '../../../core/business-date';
import { pricingColumns } from './access-request-pricing.mapper';
import { SELECT_REQUEST, toRecord } from './access-request-record.mapper';
import type { AccessRequestBranchCode, RequestPolicy } from './access-request.policy';
import type {
  AccessRequestState,
  PricingRecord,
  NewAccessRequest,
  NewNeedDecision,
  NewNeedStep,
  WithdrawalRecord,
  AccessRequestRecord,
  CancellationRecord,
} from './access-request.types';

const NEED_SEQUENCE = 1;

/** The one writer of `access_requests`, `access_request_beneficiaries` and `access_request_steps`, and the read of a request. */
@Injectable()
export class AccessRequestRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the request, the people it is for and its need step together, and returns its id and the id of its need step. */
  async insert(tx: DbTx, input: NewAccessRequest): Promise<{ id: string; needStepId: string }> {
    const { needStep } = input;
    const created = await tx.accessRequest.create({
      data: {
        organizationId: input.organizationId,
        type: input.type ?? 'GRANT',
        branch: input.branch,
        state: input.state,
        planId: input.planId,
        requesterEmployeeId: input.requesterEmployeeId,
        departmentId: input.departmentId,
        costCenterId: input.costCenterId,
        businessReason: input.businessReason,
        termMonths: input.termMonths,
        projectLabel: input.projectLabel,
        outsideStandardReason: input.outsideStandardReason,
        outsideStandard: input.outsideStandard,
        delegatedBatchId: input.delegatedBatchId ?? null,
        expectedEndDate: input.expectedEndDate ? toDateColumn(input.expectedEndDate) : null,
        ...pricingColumns(input.pricing),
        policy: input.policy as unknown as Prisma.InputJsonObject,
        createdByAppUserId: input.createdByAppUserId,
        submittedAt: input.now,
        beneficiaries: {
          create: input.beneficiaryEmployeeIds.map((employeeId, index) => ({ employeeId, position: index + 1 })),
        },
        steps: {
          create: {
            kind: 'NEED',
            sequence: NEED_SEQUENCE,
            state: needStep.state,
            assigneeEmployeeId: needStep.assigneeEmployeeId,
            routingRow: needStep.routingRow,
            waitingReason: needStep.waitingReason,
            samePersonAsSpend: needStep.samePersonAsSpend,
            slaWorkingDays: needStep.slaWorkingDays,
            createdAt: input.now,
            assignedAt: needStep.state === 'PENDING' ? input.now : null,
          },
        },
      },
      select: { id: true, steps: { select: { id: true }, take: 1 } },
    });

    return { id: created.id, needStepId: created.steps[0].id };
  }

  /**
   * Adds a need step after the ones the request has: a request for a group has one for the people the head decides on and one for
   * the head themselves, which a different person decides (`US-05-03` AC-8). Returns its id.
   */
  async addNeedStep(tx: DbTx, input: { requestId: string; step: NewNeedStep; now: Date }): Promise<string> {
    const last = await tx.accessRequestStep.aggregate({
      where: { requestId: input.requestId },
      _max: { sequence: true },
    });
    const { step } = input;
    const created = await tx.accessRequestStep.create({
      data: {
        requestId: input.requestId,
        kind: 'NEED',
        sequence: (last._max.sequence ?? 0) + 1,
        state: step.state,
        assigneeEmployeeId: step.assigneeEmployeeId,
        routingRow: step.routingRow,
        waitingReason: step.waitingReason,
        samePersonAsSpend: step.samePersonAsSpend,
        slaWorkingDays: step.slaWorkingDays,
        createdAt: input.now,
        assignedAt: step.state === 'PENDING' ? input.now : null,
      },
      select: { id: true },
    });

    return created.id;
  }

  /** The request, locked `FOR UPDATE` until the transaction ends so two decisions of one step queue; null when none. */
  async lockById(tx: DbTx, id: string): Promise<AccessRequestRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM access_requests WHERE id = ${id}::uuid FOR UPDATE`;

    return rows.length === 0 ? null : this.findById(id, tx);
  }

  /** Decides the need step: the step and the request move, and the record of the decision is written, together. */
  async recordNeedDecision(tx: DbTx, input: NewNeedDecision): Promise<void> {
    const { record } = input;
    await tx.accessRequestStep.update({
      where: { id: input.stepId },
      data: { state: record.decision, decidedAt: record.decidedAt },
    });
    await tx.accessRequest.update({ where: { id: input.requestId }, data: { state: input.requestState } });
    await tx.approvalRecord.create({
      data: {
        organizationId: input.organizationId,
        requestId: input.requestId,
        stepId: input.stepId,
        decision: record.decision,
        decidedByEmployeeId: record.decidedByEmployeeId,
        deciderRole: record.deciderRole,
        departmentId: input.departmentId,
        reason: record.reason,
        termConfirmationReason: record.termConfirmationReason,
        decidedAt: record.decidedAt,
      },
    });
  }

  /** Moves the request to a state; the caller holds the lock and has judged that the move is allowed. */
  async setState(tx: DbTx, id: string, state: AccessRequestState): Promise<void> {
    await tx.accessRequest.update({ where: { id }, data: { state } });
  }

  /**
   * Ends the carrying out of the grant: COMPLETED (with the moment the task was completed, which is what the time of the grant is
   * measured to, `US-05-15` AC-11) or FAILED. The caller holds the lock and has judged that the move is allowed.
   */
  async setGrantOutcome(tx: DbTx, id: string, outcome: 'COMPLETED' | 'FAILED', now: Date): Promise<void> {
    await tx.accessRequest.update({
      where: { id },
      data: { state: outcome, grantCompletedAt: outcome === 'COMPLETED' ? now : null },
    });
  }

  /**
   * Writes the withdrawal: the request ends as withdrawn (`withdrawnAt` set), or waits for the IT Admin to close the task of
   * its grant (`withdrawnAt` null). The caller holds the lock and has judged that the move is allowed (`US-05-08`).
   */
  async setWithdrawal(
    tx: DbTx,
    id: string,
    withdrawal: WithdrawalRecord,
    state: 'WITHDRAWN' | 'AWAITING_IT_CLOSE',
  ): Promise<void> {
    await tx.accessRequest.update({
      where: { id },
      data: {
        state,
        withdrawalRequestedAt: withdrawal.requestedAt,
        withdrawnByEmployeeId: withdrawal.requestedByEmployeeId,
        withdrawalReason: withdrawal.reason,
        withdrawnAt: withdrawal.withdrawnAt,
      },
    });
  }

  /**
   * Writes the cancellation: the request ends as cancelled because its beneficiary left, with who closed it and when. The caller holds
   * the lock and has judged that the move is allowed (`US-03-04` AC-25).
   */
  async setCancellation(tx: DbTx, id: string, cancellation: CancellationRecord): Promise<void> {
    await tx.accessRequest.update({
      where: { id },
      data: {
        state: 'CANCELLED',
        cancelledAt: cancellation.cancelledAt,
        cancelledByEmployeeId: cancellation.cancelledByEmployeeId,
        cancelCause: cancellation.cause,
        cancelNote: cancellation.note,
      },
    });
  }

  /** Writes what the request costs and moves it on, together: the IT Admin completing the assessment prices it (`US-05-06`). */
  async setPriced(tx: DbTx, id: string, pricing: PricingRecord, state: AccessRequestState): Promise<void> {
    await tx.accessRequest.update({ where: { id }, data: { ...pricingColumns(pricing), state } });
  }

  /**
   * The software of a proposal is registered (`US-05-20`): the request takes the plan, and the branch, chain, price and state
   * that go with what was decided, together.
   */
  async setRegistered(
    tx: DbTx,
    id: string,
    registration: {
      planId: string;
      branch: AccessRequestBranchCode;
      policy: RequestPolicy;
      pricing: PricingRecord;
      state: AccessRequestState;
    },
  ): Promise<void> {
    await tx.accessRequest.update({
      where: { id },
      data: {
        planId: registration.planId,
        branch: registration.branch,
        policy: registration.policy as unknown as Prisma.InputJsonObject,
        state: registration.state,
        ...pricingColumns(registration.pricing),
      },
    });
  }

  /** Writes the line of the plan of the budget the head attached the request to, or that it is outside the plan (`US-05-04` AC-12). */
  async setSpendPlan(
    tx: DbTx,
    id: string,
    plan: { line: { versionId: string; position: number; confirmed: boolean } | null; offPlan: boolean },
  ): Promise<void> {
    await tx.accessRequest.update({
      where: { id },
      data: {
        planLineVersionId: plan.line?.versionId ?? null,
        planLinePosition: plan.line?.position ?? null,
        planLineConfirmed: plan.line?.confirmed ?? false,
        offPlan: plan.offPlan,
      },
    });
  }

  /** Writes a new price over the old one: the day the money goes out changed (`QĐ-82n`, `US-05-04` AC-16). */
  async setPricing(tx: DbTx, id: string, pricing: PricingRecord): Promise<void> {
    await tx.accessRequest.update({ where: { id }, data: pricingColumns(pricing) });
  }

  /** Links the plan registered in the catalog to a proposal that waits for its grant (`US-05-06` AC-8). */
  async setPlan(tx: DbTx, id: string, planId: string): Promise<void> {
    await tx.accessRequest.update({ where: { id }, data: { planId } });
  }

  /**
   * The people of these who have a request for the plan open: one of their own that is still being decided or carried out, or a line
   * of a request for a group that has not ended. Nobody who has it open is named in another request for the plan (`US-05-17` AC-15).
   */
  async openRequestHolders(tx: DbTx, planId: string, employeeIds: readonly string[]): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const rows = await tx.$queryRaw<{ employee_id: string }[]>`
      SELECT DISTINCT b.employee_id
        FROM access_request_beneficiaries b
        JOIN access_requests r ON r.id = b.request_id
        LEFT JOIN access_request_lines l ON l.request_id = b.request_id AND l.employee_id = b.employee_id
       WHERE r.plan_id = ${planId}::uuid AND b.employee_id = ANY(${[...employeeIds]}::uuid[])
         AND r.type IN ('GRANT', 'GROUP_GRANT')
         AND (
           (r.type = 'GRANT' AND r.state NOT IN ('REJECTED', 'IT_REJECTED', 'FAILED', 'WITHDRAWN', 'CANCELLED', 'COMPLETED'))
           OR (r.type = 'GROUP_GRANT'
               AND l.state NOT IN ('NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED', 'CANCELLED'))
         )`;

    return new Set(rows.map((row) => row.employee_id));
  }

  async findById(id: string, tx?: DbTx): Promise<AccessRequestRecord | null> {
    const row = await (tx ?? this.prisma).accessRequest.findUnique({ where: { id }, select: SELECT_REQUEST });

    return row ? toRecord(row) : null;
  }
}
