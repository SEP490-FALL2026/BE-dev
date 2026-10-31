import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import {
  HeadHandoverRefusedError,
  PlacementDepartmentInactiveError,
  PlacementOverlapError,
} from '../../organization/public/organization.errors';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { PersonnelFileHooks } from '../event-notice/personnel-file-hooks.service';
import { personnelAuditEvent } from '../personnel-audit-event.mapper';
import { groundsSnapshot, normalizedGrounds } from '../personnel-grounds.policy';
import { actorColumns, type PersonnelActor } from '../public/personnel.types';
import { TransferRefusedError } from './transfer.errors';
import { headSuccessorLabel, retiredDestinationRefusal } from './transfer.policy';
import type { TransferHeld, TransferSeen } from './transfer-preconditions.service';
import { TransferRepo } from './transfer.repo';
import { TransferSettlementService } from './transfer-settlement.service';
import type { HeadHandoverFacts, RecordTransferInput, TransferRecord } from './transfer.types';

/**
 * Writes a change of department once it is allowed (`US-03-01` AC-4 -> AC-8, AC-22): the periods ahead of the day (the head of the
 * department they leave is handed over or left empty by choice, the placement ends and the new one begins), the transfer, its audit
 * entry, the hook of the file and the notices; a transfer for today takes effect at once. Returns the transfer as it is read back.
 */
@Injectable()
export class TransferRecorder {
  constructor(
    private readonly history: OrganizationHistoryApi,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
    private readonly audit: AuditApi,
    private readonly hooks: PersonnelFileHooks,
    private readonly notifier: PersonnelNotifier,
  ) {}

  async write(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordTransferInput,
    facts: { seen: TransferSeen; held: TransferHeld; organizationId: string; today: BusinessDate },
  ): Promise<TransferRecord> {
    const { seen, held, organizationId, today } = facts;
    const grounds = normalizedGrounds(input.grounds ?? {});
    const handover = await this.handOverHead(tx, {
      organizationId,
      departmentId: seen.before.departmentId,
      employeeId: input.employeeId,
      effectiveOn: input.effectiveOn,
      successor: seen.leavesAsHead ? input.successor : undefined,
    });
    const scheduled = await this.scheduleStructure(tx, {
      organizationId,
      employeeId: input.employeeId,
      effectiveOn: input.effectiveOn,
      departmentId: seen.toDepartmentId,
    });
    const record = await this.insertTransfer(tx, {
      organizationId,
      employeeId: input.employeeId,
      fromDepartmentId: seen.before.departmentId,
      toDepartmentId: seen.toDepartmentId,
      effectiveOn: input.effectiveOn,
      closesPlacementId: scheduled.closedPlacementId,
      opensPlacementId: scheduled.openedPlacementId,
      headHandover: handover,
      grounds,
      recordedByAppUserId: actorColumns(actor).appUserId,
      recordedByTicketId: actorColumns(actor).ticketId,
      noticeId: input.noticeId ?? null,
    });

    await this.audit.record(
      tx,
      personnelAuditEvent(
        actor,
        organizationId,
        'DEPARTMENT_TRANSFER.RECORDED',
        'DepartmentTransfer',
        record.id,
        {
          employeeCode: held.employee.employeeCode,
          department: held.departments.get(seen.before.departmentId)?.code ?? null,
        },
        {
          department: held.departments.get(seen.toDepartmentId)?.code ?? null,
          effectiveOn: input.effectiveOn,
          grounds: groundsSnapshot(grounds),
          headSuccessor: headSuccessorLabel(handover),
        },
      ),
    );
    await this.announce(tx, record, organizationId, today);

    return (await this.transfers.find(record.id, tx)) ?? record;
  }

  /** The hook of the file and the notices; a transfer for today has already taken effect: the placement began in this transaction. */
  private async announce(tx: DbTx, record: TransferRecord, organizationId: string, today: BusinessDate): Promise<void> {
    await this.hooks.onRecorded(tx, {
      fileKind: 'TRANSFER',
      fileId: record.id,
      employeeId: record.employeeId,
      dueOn: record.effectiveOn,
    });
    await this.notifier.eventRecorded(tx, {
      organizationId,
      employeeId: record.employeeId,
      departmentId: record.toDepartmentId,
      alsoDepartmentIds: [record.fromDepartmentId],
      eventKind: 'TRANSFER_RECORDED',
      eventId: record.id,
      subjectType: 'DEPARTMENT_TRANSFER',
      effectiveOn: record.effectiveOn,
    });
    if (record.effectiveOn <= today) await this.settlement.settleOne(tx, record.id, 'RECORDED_FOR_TODAY');
  }

  /** Ends the head's period and opens the successor's; null when the person heads nothing across the day. */
  private async handOverHead(
    tx: DbTx,
    input: {
      organizationId: string;
      departmentId: string;
      employeeId: string;
      effectiveOn: BusinessDate;
      successor: RecordTransferInput['successor'];
    },
  ): Promise<HeadHandoverFacts | null> {
    if (!input.successor) return null;
    const successorEmployeeId = input.successor.kind === 'EMPLOYEE' ? input.successor.employeeId : null;
    try {
      const moved = await this.history.scheduleHeadHandover(tx, {
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        outgoingEmployeeId: input.employeeId,
        effectiveOn: input.effectiveOn,
        successorEmployeeId,
      });

      return moved && { ...moved, successor: successorEmployeeId ? 'EMPLOYEE' : 'NONE', successorEmployeeId };
    } catch (error) {
      if (error instanceof HeadHandoverRefusedError) {
        throw new TransferRefusedError('SUCCESSOR_NOT_A_MEMBER_ON_DATE', { reason: error.reason });
      }
      throw error;
    }
  }

  private async scheduleStructure(tx: DbTx, input: Parameters<OrganizationHistoryApi['scheduleStructureChange']>[1]) {
    try {
      return await this.history.scheduleStructureChange(tx, input);
    } catch (error) {
      if (error instanceof PlacementOverlapError)
        throw new TransferRefusedError('PLACEMENT_OVERLAP', { reason: error.reason });
      if (error instanceof PlacementDepartmentInactiveError) {
        const refusal = retiredDestinationRefusal();
        throw new TransferRefusedError(refusal.code, refusal.details);
      }
      throw error;
    }
  }

  private async insertTransfer(tx: DbTx, input: Parameters<TransferRepo['insert']>[1]): Promise<TransferRecord> {
    try {
      return await this.transfers.insert(tx, input);
    } catch (error) {
      if (isUniqueViolation(error, 'one_pending_per_employee', 'employee_id'))
        throw new TransferRefusedError('PENDING_EVENT_EXISTS', { kind: 'TRANSFER' });
      throw error;
    }
  }
}
