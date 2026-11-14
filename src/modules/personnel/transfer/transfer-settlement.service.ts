import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { TransferGraceService } from '../transfer-grace/transfer-grace.service';
import { TransferRepo } from './transfer.repo';
import type { TransferRecord } from './transfer.types';

/**
 * A transfer reaches its day (`DEPARTMENT_TRANSFER.EFFECTIVE`): the system marks it effective and says so in the Audit Trail, then opens the
 * grace of the old rights of the person (`TransferGraceService`: the paid requests of the old department closed, the money held for the old
 * rights given back, the last day of the grace kept and told).
 * Whoever sees the day first does it: the write of a transfer for today, the organization telling its listeners that the
 * placement began, or the next write for the same person when the hourly sweep has not run yet. Doing it twice is a no-op.
 */
@Injectable()
export class TransferSettlementService {
  constructor(
    private readonly transfers: TransferRepo,
    private readonly audit: AuditApi,
    private readonly grace: TransferGraceService,
  ) {}

  /** The transfer that opened this placement takes effect now; `source` names who noticed (kept in the audit event). */
  async settleByPlacement(tx: DbTx, placementId: string, source: string, changeId?: string): Promise<void> {
    const settled = await this.transfers.settleByOpenedPlacement(tx, placementId);
    if (settled) await this.record(tx, settled, source, changeId);
  }

  async settleOne(tx: DbTx, id: string, source: string): Promise<void> {
    const settled = await this.transfers.settle(tx, id);
    if (settled) await this.record(tx, settled, source);
  }

  /** The waiting transfers of the person whose day has come become effective. */
  async settleDueOf(tx: DbTx, employeeId: string, today: BusinessDate): Promise<void> {
    for (const settled of await this.transfers.settleDue(tx, employeeId, today)) {
      await this.record(tx, settled, 'NEXT_WRITE');
    }
  }

  private async record(tx: DbTx, transfer: TransferRecord, source: string, changeId?: string): Promise<void> {
    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        transfer.organizationId,
        'DEPARTMENT_TRANSFER.EFFECTIVE',
        'DepartmentTransfer',
        transfer.id,
        changeId ?? transfer.id,
        { status: 'PENDING' },
        { status: 'EFFECTIVE', effectiveOn: transfer.effectiveOn, noticedBy: source },
      ),
    );
    await this.grace.open(tx, transfer);
  }
}
