import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  renewalRoutedDetail,
  renewalSubmittedDetail,
  type RenewalSubmission,
  type RenewedSeat,
} from './renewal-request-submission.mapper';

/**
 * The audit events of sending a request for a renewal: the request and where its need step went. The events carry who, which
 * seat, the ends and the amount; never the reason or the identifier of the account.
 */
@Injectable()
export class RenewalRequestTrail {
  constructor(private readonly audit: AuditApi) {}

  async submitted(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    sent: RenewalSubmission,
    written: { created: { id: string; needStepId: string }; seat: RenewedSeat },
  ): Promise<void> {
    const { created, seat } = written;
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        sent.organizationId,
        'ACCESS_REQUEST.SUBMITTED',
        'ACCESS_REQUEST',
        created.id,
        renewalSubmittedDetail(sent, seat),
      ),
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        sent.organizationId,
        'ACCESS_REQUEST.NEED_STEP_ROUTED',
        'ACCESS_REQUEST_STEP',
        created.needStepId,
        renewalRoutedDetail(sent, created.id),
      ),
    );
  }
}
