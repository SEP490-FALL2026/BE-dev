import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { personnelAuditEvent } from '../personnel-audit-event.mapper';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { technicalStepRefusal } from '../personnel-self-action.policy';
import { TRANSFER_REVIEW_OPEN, userActor } from '../public/personnel.types';
import { TransferGuardService } from './transfer-guard.service';
import { TransferRefusedError } from './transfer.errors';
import { TransferRepo } from './transfer.repo';
import { TransferSettlementService } from './transfer-settlement.service';
import type { TransferRecord } from './transfer.types';

/**
 * Closes a transfer that has taken effect (`BM-04`): never before it takes effect, never twice, and not while the review of the tools the
 * new head has not finished is open. A transfer that is not closed still took effect on its day: closing only says the loose ends of the
 * person are tied. There is no service account to wait for any more (`QĐ-110m`). Throws TransferRefusedError.
 */
@Injectable()
export class TransferClosureService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly guard: TransferGuardService,
  ) {}

  /** Closing is a technical step that follows the event: the IT Admin's, judged here and not only by the guard of the route. */
  close(actor: AuthenticatedPrincipal, id: string): Promise<TransferRecord> {
    const refused = technicalStepRefusal(actor);
    if (refused) throw new PersonnelAccessRefusedError(refused);

    return this.guard.guarded(() => this.closeInTx(actor, id));
  }

  private closeInTx(actor: AuthenticatedPrincipal, id: string): Promise<TransferRecord> {
    return this.runner.run(async (tx) => {
      const today = await this.organizationReads.businessToday(new Date(), tx);
      const probe = await this.transfers.find(id, tx);
      if (!probe) throw new TransferRefusedError('NOT_FOUND');
      // A transfer whose day has come but that no write has settled yet is effective now.
      await this.settlement.settleDueOf(tx, probe.employeeId, today);
      const held = await this.transfers.lock(tx, id);
      if (!held) throw new TransferRefusedError('NOT_FOUND');
      if (held.status === 'CANCELLED') throw new TransferRefusedError('ALREADY_CANCELLED');
      if (held.closedAt !== null) throw new TransferRefusedError('ALREADY_CLOSED');
      if (held.status !== 'EFFECTIVE') throw new TransferRefusedError('NOT_CLOSEABLE', { blockers: ['NOT_EFFECTIVE'] });

      // The review of the tools the new head has not finished keeps the record open (`US-03-08` AC-5, `US-03-07`), told by its code with
      // how many there are.
      const reviews = await this.transfers.countOpenReviews(tx, held.id);
      if (reviews > 0) {
        throw new TransferRefusedError('NOT_CLOSEABLE', { blockers: [TRANSFER_REVIEW_OPEN], openReviews: reviews });
      }
      const closed = await this.transfers.close(tx, id, actor.appUserId);
      await this.audit.record(
        tx,
        personnelAuditEvent(
          userActor(actor),
          held.organizationId,
          'DEPARTMENT_TRANSFER.CLOSED',
          'DepartmentTransfer',
          held.id,
          { closed: false },
          { closed: true, employeeId: held.employeeId, effectiveOn: held.effectiveOn },
        ),
      );

      return closed;
    });
  }
}
