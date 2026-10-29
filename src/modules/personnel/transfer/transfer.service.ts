import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import {
  EmployeeNotFoundError,
  HeadHandoverRefusedError,
  PlacementDepartmentInactiveError,
  PlacementOverlapError,
} from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { groundsSnapshot, normalizedGrounds } from '../policies/grounds.policy';
import { personnelAuditEvent } from '../mappers/personnel-audit-event.mapper';
import { PersonnelFileHooks } from '../event-notice/personnel-file-hooks.service';
import { actorColumns, type PersonnelActor } from '../public/personnel.types';
import { TransferRefusedError } from './transfer.errors';
import { newTransferRefusal, retiredDestinationRefusal } from './transfer.policy';
import { TransferGuardService } from './transfer-guard.service';
import { TransferRepo } from './transfer.repo';
import { TransferSettlementService } from './transfer-settlement.service';
import {
  WARNING_APPLICATION_LIMIT,
  type HeadHandoverFacts,
  type RecordTransferInput,
  type TransferOutcome,
  type TransferRecord,
  type TransferWarning,
} from './transfer.types';

/**
 * Records a change of department with the day it takes effect and the basis it rests on (`US-03-01` AC-1, AC-2,
 * AC-4 -> AC-8, AC-11, AC-13 -> AC-18, AC-22). The periods are written ahead, in this transaction: the one the person has ends
 * on the day, the new one begins on it, and the head of the department they leave is handed over or left empty by choice. No
 * seat is touched and no step of a request is moved here: the listeners of the organization act on the day.
 */
@Injectable()
export class TransferService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
    private readonly audit: AuditApi,
    private readonly hooks: PersonnelFileHooks,
    private readonly catalog: CatalogApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Throws TransferRefusedError for everything the policy or the database refuses, and PersonnelAccessRefusedError for the actor. */
  async record(actor: PersonnelActor, input: RecordTransferInput): Promise<TransferOutcome> {
    this.guard.requireWriter(actor, input.employeeId);
    const transfer = await this.guard.guarded(() => this.runner.run((tx) => this.recordInTx(tx, actor, input)));
    const owned = await this.catalog.getApplicationsOwnedBy(input.employeeId, WARNING_APPLICATION_LIMIT);
    const warnings: TransferWarning[] =
      owned.total > 0
        ? [{ code: 'BUSINESS_OWNER_REPLACEMENT_NEEDED', applications: owned.items, totalApplications: owned.total }]
        : [];

    return { transfer, warnings };
  }

  /** The same in the transaction of the caller (the writes that start from a notice of the head, later). */
  async recordInTx(tx: DbTx, actor: PersonnelActor, input: RecordTransferInput): Promise<TransferRecord> {
    this.guard.requireWriter(actor, input.employeeId);
    const organization = await this.guard.requireOrganization();
    const today = await this.organization.businessToday(new Date(), tx);

    // What the person is now, read before the locks so they can be taken in the order of the protocol.
    const seen = await this.organization.getEmployee(input.employeeId, tx);
    if (!seen) throw new TransferRefusedError('EMPLOYEE_NOT_FOUND');
    if (seen.status === 'TERMINATED') throw new TransferRefusedError('EMPLOYEE_LEFT');
    const before = await this.history.getPlacementInForce(tx, input.employeeId, today);
    if (!before) throw new TransferRefusedError('PLACEMENT_OVERLAP');
    const toDepartmentId = input.toDepartmentId ?? before.departmentId;
    const departmentChanges = toDepartmentId !== before.departmentId;
    const dayBefore = addDays(input.effectiveOn, -1);
    const leavesAsHead =
      departmentChanges &&
      (await this.organization.getHeadedDepartment(input.employeeId, dayBefore))?.departmentId === before.departmentId;

    // Locks (T-11): the departments by id, then the employee (and a chosen successor), then accounts.
    const departments = await this.history.lockDepartments(tx, {
      updateIds: leavesAsHead ? [before.departmentId] : [],
      shareIds: [before.departmentId, toDepartmentId],
    });
    await this.organization.lockEmployeeForUpdate(tx, input.employeeId);
    if (leavesAsHead && input.successor?.kind === 'EMPLOYEE') {
      await this.lockSuccessor(tx, input.successor.employeeId);
    }
    await this.guard.requireOperatorSubject(tx, actor, input.employeeId);

    const employee = await this.organization.getEmployee(input.employeeId, tx);
    const current = await this.history.getPlacementInForce(tx, input.employeeId, today);
    if (!employee || !current || current.placementId !== before.placementId) {
      throw new TransferRefusedError('CONCURRENT_CHANGE');
    }
    const headNow =
      departmentChanges &&
      (await this.organization.getHeadedDepartment(input.employeeId, dayBefore))?.departmentId === before.departmentId;
    if (headNow && !leavesAsHead) throw new TransferRefusedError('CONCURRENT_CHANGE');

    await this.settlement.settleDueOf(tx, input.employeeId, today);
    const destination = departments.get(toDepartmentId) ?? null;
    const oldDepartment = departments.get(before.departmentId);
    const refusal = newTransferRefusal({
      today,
      effectiveOn: input.effectiveOn,
      employee: { status: employee.status, workState: employee.workState },
      current: { departmentId: current.departmentId, validFrom: current.validFrom },
      target: { departmentId: toDepartmentId },
      destinationDepartment: destination && { active: destination.active },
      grounds: input.grounds,
      pending: await this.pendingOf(tx, input.employeeId),
      namedAsSuccessor: await this.transfers.isNamedSuccessorOfPending(tx, input.employeeId),
      successor: await this.guard.successorFacts(tx, {
        required: leavesAsHead,
        chosen: input.successor,
        transfereeId: input.employeeId,
        oldDepartmentId: before.departmentId,
        day: input.effectiveOn,
      }),
    });
    if (refusal)
      this.guard.refuse(
        refusal,
        refusal.code === 'HEAD_SUCCESSOR_REQUIRED' ? { departmentName: oldDepartment?.name } : undefined,
      );
    const grounds = normalizedGrounds(input.grounds ?? {});

    const handover = await this.handOverHead(tx, {
      organizationId: organization.id,
      departmentId: before.departmentId,
      employeeId: input.employeeId,
      effectiveOn: input.effectiveOn,
      successor: leavesAsHead ? input.successor : undefined,
    });
    const scheduled = await this.scheduleStructure(tx, {
      organizationId: organization.id,
      employeeId: input.employeeId,
      effectiveOn: input.effectiveOn,
      departmentId: toDepartmentId,
    });
    const record = await this.insertTransfer(tx, {
      organizationId: organization.id,
      employeeId: input.employeeId,
      fromDepartmentId: before.departmentId,
      toDepartmentId,
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
        organization.id,
        'DEPARTMENT_TRANSFER.RECORDED',
        'DepartmentTransfer',
        record.id,
        {
          employeeCode: employee.employeeCode,
          department: oldDepartment?.code ?? null,
        },
        {
          department: destination?.code ?? null,
          effectiveOn: input.effectiveOn,
          grounds: groundsSnapshot(grounds),
          headSuccessor: handover ? (handover.successorEmployeeId ?? 'NONE') : null,
        },
      ),
    );
    await this.hooks.onRecorded(tx, {
      fileKind: 'TRANSFER',
      fileId: record.id,
      employeeId: record.employeeId,
      dueOn: record.effectiveOn,
    });
    await this.notifier.eventRecorded(tx, {
      organizationId: organization.id,
      employeeId: record.employeeId,
      departmentId: record.toDepartmentId,
      alsoDepartmentIds: [record.fromDepartmentId],
      eventKind: 'TRANSFER_RECORDED',
      eventId: record.id,
      subjectType: 'DEPARTMENT_TRANSFER',
      effectiveOn: record.effectiveOn,
    });
    // A transfer for today has already taken effect: the placement began in this transaction and the listeners were told.
    if (input.effectiveOn <= today) await this.settlement.settleOne(tx, record.id, 'RECORDED_FOR_TODAY');

    return (await this.transfers.find(record.id, tx)) ?? record;
  }

  private async pendingOf(tx: DbTx, employeeId: string): Promise<{ effectiveOn: BusinessDate } | null> {
    const pending = await this.transfers.findPendingOf(tx, employeeId);

    return pending && { effectiveOn: pending.effectiveOn };
  }

  /** Takes the successor row `FOR SHARE`; one that does not exist is judged by the policy, not here. */
  private async lockSuccessor(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (!(error instanceof EmployeeNotFoundError)) throw error;
    }
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
