import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { LicensingService } from '../../licensing/licensing.service';
import { OrganizationService } from '../../organization/organization.service';
import { personnelAuditEvent } from '../mappers/personnel-audit-event';
import { SERVICE_ACCOUNT_UNASSIGNED } from '../personnel.types';
import { TransferRefusedError } from './transfer.errors';
import { TransferRepo } from './transfer.repo';
import { TransferSettlementService } from './transfer-settlement.service';
import type { TransferRecord } from './transfer.types';

/**
 * Closes a transfer that has taken effect (`US-03-08` AC-5, `BM-04`): only once the people who answer for the service accounts of the
 * person are named, never before it takes effect, and never twice. A transfer that is not closed still took effect on its day: closing
 * only says the loose ends of the person are tied. Throws TransferRefusedError.
 */
@Injectable()
export class TransferClosureService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
    private readonly organization: OrganizationService,
    private readonly licensing: LicensingService,
    private readonly audit: AuditService,
  ) {}

  close(actor: AuthenticatedPrincipal, id: string): Promise<TransferRecord> {
    return this.runner.run(async (tx) => {
      const today = await this.organization.businessToday(new Date(), tx);
      const probe = await this.transfers.find(id, tx);
      if (!probe) throw new TransferRefusedError('NOT_FOUND');
      // A transfer whose day has come but that no write has settled yet is effective now.
      await this.settlement.settleDueOf(tx, probe.employeeId, today);
      const held = await this.transfers.lock(tx, id);
      if (!held) throw new TransferRefusedError('NOT_FOUND');
      if (held.status === 'CANCELLED') throw new TransferRefusedError('ALREADY_CANCELLED');
      if (held.closedAt !== null) throw new TransferRefusedError('ALREADY_CLOSED');
      if (held.status !== 'EFFECTIVE') throw new TransferRefusedError('NOT_CLOSEABLE', { blockers: ['NOT_EFFECTIVE'] });

      const open = await this.licensing.listServiceAccountDuties([held.employeeId], tx);
      if (open.length > 0) {
        throw new TransferRefusedError('NOT_CLOSEABLE', {
          blockers: [SERVICE_ACCOUNT_UNASSIGNED],
          serviceAccounts: open.length,
        });
      }
      const closed = await this.transfers.close(tx, id, actor.appUserId);
      await this.audit.record(
        tx,
        personnelAuditEvent(
          actor,
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
