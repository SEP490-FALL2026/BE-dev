import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { checkAnswer, checkAsk } from './budget-information.policy';
import type { BudgetInformationWire } from './budget-information.dto';
import {
  BudgetInformationRepo,
  type BudgetInformationAnswer,
  type BudgetInformationCloseReason,
  type BudgetInformationRecord,
} from './budget-information.repo';
import { BudgetInformationViewService } from './budget-information-view.service';
import { BudgetInformationNotFoundError, BudgetInformationRefusedError } from './spend.errors';
import { SpendStepRepo } from './spend-step.repo';

/**
 * The question the spending approver puts to Finance while the spend step is theirs, and the answer of Finance
 * (`US-06-02`, `US-06-03`). It is advice: asking does not move the step, its SLA or the request, an answer does not decide or
 * change the snapshot, and nobody answers in place of Finance (`FR-3.14`). The request is locked while a question is put,
 * answered or closed, so two answers queue and the second finds the question ended.
 */
@Injectable()
export class BudgetInformationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly questions: BudgetInformationRepo,
    private readonly views: BudgetInformationViewService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Throws AccessRequestNotFoundError and BudgetInformationRefusedError. */
  async ask(actor: AuthenticatedPrincipal, requestId: string, question: string): Promise<BudgetInformationWire> {
    const asked = await this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();
      const step = await this.steps.findOpen(requestId, 'SPEND_APPROVAL', tx);
      if (!step) throw new BudgetInformationRefusedError('NO_SPEND_STEP');
      const refusal = checkAsk({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        assigneeEmployeeId: step.assigneeEmployeeId,
        stepState: step.state,
        hasOpenQuestion: (await this.questions.findOpenOfStep(tx, step.id)) !== null,
      });
      if (refusal) throw new BudgetInformationRefusedError(refusal);

      const record = await this.questions.insert(tx, {
        requestId,
        stepId: step.id,
        askedByEmployeeId: actor.employeeId,
        question,
        askedAt: new Date(),
      });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'BUDGET_INFORMATION.ASKED',
          'BUDGET_INFORMATION_REQUEST',
          record.id,
          {
            requestId,
            stepId: step.id,
          },
        ),
      );

      return record;
    });

    return (await this.views.wire([asked]))[0];
  }

  /** Throws BudgetInformationNotFoundError and BudgetInformationRefusedError. */
  async answer(
    actor: AuthenticatedPrincipal,
    id: string,
    body: { answer: BudgetInformationAnswer; note?: string },
  ): Promise<BudgetInformationWire> {
    const answered = await this.runner.run(async (tx) => {
      // The request is locked before the question, as everything that closes a question does, so the two never wait on each other.
      const found = await this.questions.findById(tx, id);
      if (!found) throw new BudgetInformationNotFoundError();
      const request = await this.requests.lockById(tx, found.requestId);
      if (!request) throw new BudgetInformationNotFoundError();
      // Read again under the lock: the question may have been closed while this one waited.
      const question = (await this.questions.lockById(tx, id)) as BudgetInformationRecord;
      const step = await this.steps.findLatest(request.id, 'SPEND_APPROVAL', tx);
      const holders = await this.identity.getApprovalRoleHolders(tx);
      const refusal = checkAnswer({
        actorIsFinance: actor.roles.includes('FINANCE'),
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        approverEmployeeIds: [step?.assigneeEmployeeId ?? null, holders.spendingApproverEmployeeId],
        questionState: question.state,
      });
      if (refusal) throw new BudgetInformationRefusedError(refusal);

      const record = await this.questions.answer(tx, id, {
        answer: body.answer,
        note: body.note ?? null,
        answeredByEmployeeId: actor.employeeId,
        answeredAt: new Date(),
      });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'BUDGET_INFORMATION.ANSWERED',
          'BUDGET_INFORMATION_REQUEST',
          id,
          {
            requestId: request.id,
            answer: body.answer,
          },
        ),
      );

      return record;
    });

    return (await this.views.wire([answered]))[0];
  }

  /**
   * Closes the questions of the request that wait, in the transaction of what made them pointless: the request was withdrawn,
   * or the spend step went back with no decision (`US-06-02` AC-4, `US-05-08` AC-2).
   */
  async closeOpen(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: { id: string; organizationId: string },
    reason: BudgetInformationCloseReason,
    now: Date,
  ): Promise<void> {
    for (const closed of await this.questions.closeOpenOfRequest(tx, request.id, reason, now)) {
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'BUDGET_INFORMATION.CLOSED',
          'BUDGET_INFORMATION_REQUEST',
          closed.id,
          {
            requestId: request.id,
            reason,
          },
        ),
      );
    }
  }
}
