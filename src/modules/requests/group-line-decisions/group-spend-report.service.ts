import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import {
  groupSpendDecidedDetail,
  lineSpendDecidedDetail,
  type LineVerdict,
} from '../group-request/group-line-decision.policy';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import type { SpendStepRecord } from '../spend/spend-step.repo';

/**
 * What the Audit Trail says of a spend decision taken on the people of a group (`US-05-17` AC-9, `US-06-01` AC-15): one entry for each
 * person, one for the decision, and the end of the line of a person whose spend was refused, for them, without a grant.
 */
@Injectable()
export class GroupSpendReport {
  constructor(
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  async report(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    decided: {
      step: SpendStepRecord;
      verdicts: readonly LineVerdict[];
      checkId: string | null;
      usesReserve: boolean;
      reserveReason: string | null;
      now: Date;
      deciderRole: string;
      outcome: 'APPROVED' | 'REJECTED';
    },
  ): Promise<void> {
    const { step, verdicts, deciderRole } = decided;
    for (const verdict of verdicts) {
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.LINE_SPEND_DECIDED',
          'ACCESS_REQUEST_STEP',
          step.id,
          lineSpendDecidedDetail(request, step.id, verdict, { actorEmployeeId: actor.employeeId, deciderRole }),
        ),
      );
      // The line of a person whose spend was refused ended for them without a grant.
      if (verdict.decision === 'REJECT') await this.outcomes.ended(tx, request, [verdict.employeeId], decided.now);
    }
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        decided.outcome === 'APPROVED' ? 'ACCESS_REQUEST.SPEND_APPROVED' : 'ACCESS_REQUEST.SPEND_REJECTED',
        'ACCESS_REQUEST_STEP',
        step.id,
        groupSpendDecidedDetail(request, step, {
          verdicts,
          checkId: decided.checkId,
          usesReserve: decided.usesReserve,
          reserveReason: decided.reserveReason,
          decision: decided.outcome,
          deciderRole,
        }),
      ),
    );
  }
}
