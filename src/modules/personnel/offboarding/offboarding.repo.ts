import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { offboardingChangeDetailJson, type ChangeDetail } from '../personnel-change-detail.json';
import type { Grounds } from '../personnel-grounds.policy';
import { offboardingHeadHandoverJson } from '../personnel-head-handover.json';
import type {
  AccessBlockMode,
  HeadHandoverFacts,
  OffboardingChangeKind,
  OffboardingChangeRecord,
  OffboardingRecord,
  PriorWorkState,
} from './offboarding.types';

type CaseRow = Prisma.OffboardingCaseGetPayload<Record<string, never>>;

const date = (value: Date | null): BusinessDate | null => (value ? fromDateColumn(value) : null);

export function toRecord(row: CaseRow): OffboardingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    departmentId: row.departmentId,
    state: row.state,
    accessBlockMode: row.accessBlockMode,
    priorWorkState: row.priorWorkState as PriorWorkState,
    lastWorkingDay: fromDateColumn(row.lastWorkingDay),
    departureEffectiveOn: fromDateColumn(row.departureEffectiveOn),
    handoverDueOn: date(row.handoverDueOn),
    grounds: {
      type: row.groundsType,
      reference: row.groundsReference,
      issuer: row.groundsIssuer,
      issuedOn: fromDateColumn(row.groundsIssuedOn),
    },
    headHandover: offboardingHeadHandoverJson.decode(row.headHandover),
    placementClosedId: row.placementClosedId,
    cancelledPlacementId: row.cancelledPlacementId,
    cancelledPlacementDepartmentId: row.cancelledPlacementDepartmentId,
    cancelledPlacementFrom: date(row.cancelledPlacementFrom),
    leftOn: date(row.leftOn),
    leftAt: row.leftAt,
    leftByAppUserId: row.leftByAppUserId,
    cancelledAt: row.cancelledAt,
    cancelledByAppUserId: row.cancelledByAppUserId,
    cancelledByTicketId: row.cancelledByTicketId,
    cancelReason: row.cancelReason,
    accountLockByAppUserId: row.accountLockByAppUserId,
    accountLockAt: row.accountLockAt,
    accountLockNote: row.accountLockNote,
    closedAt: row.closedAt,
    closedByAppUserId: row.closedByAppUserId,
    recordedByAppUserId: row.recordedByAppUserId,
    recordedByTicketId: row.recordedByTicketId,
    recordedAt: row.recordedAt,
  };
}

export interface NewOffboarding {
  organizationId: string;
  employeeId: string;
  departmentId: string | null;
  accessBlockMode: AccessBlockMode;
  priorWorkState: PriorWorkState;
  lastWorkingDay: BusinessDate;
  departureEffectiveOn: BusinessDate;
  handoverDueOn: BusinessDate | null;
  grounds: Grounds;
  headHandover: HeadHandoverFacts | null;
  placementClosedId: string | null;
  cancelledPlacementId?: string | null;
  cancelledPlacementDepartmentId?: string | null;
  cancelledPlacementFrom?: BusinessDate | null;

  recordedByAppUserId: string | null;
  recordedByTicketId: string | null;
  noticeId?: string | null;
}

/**
 * The one writer of `offboarding_cases` and its log. A case moves only while the handover runs (its last working day, the day the
 * membership ends, the periods it wrote) and then once to LEFT or CANCELLED; after that only the lock of the account and the
 * closing are written, each once (a trigger).
 */
@Injectable()
export class OffboardingRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: NewOffboarding,
    state: 'HANDING_OVER' | 'LEFT',
    left?: { on: BusinessDate; by: string },
  ) {
    const created = await tx.offboardingCase.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        departmentId: input.departmentId ?? null,
        state,
        accessBlockMode: input.accessBlockMode,
        priorWorkState: input.priorWorkState,
        lastWorkingDay: toDateColumn(input.lastWorkingDay),
        departureEffectiveOn: toDateColumn(input.departureEffectiveOn),
        handoverDueOn: input.handoverDueOn ? toDateColumn(input.handoverDueOn) : null,
        groundsType: input.grounds.type,
        groundsReference: input.grounds.reference,
        groundsIssuer: input.grounds.issuer,
        groundsIssuedOn: toDateColumn(input.grounds.issuedOn),
        headHandover: offboardingHeadHandoverJson.encode(input.headHandover),
        placementClosedId: input.placementClosedId ?? null,
        cancelledPlacementId: input.cancelledPlacementId ?? null,
        cancelledPlacementDepartmentId: input.cancelledPlacementDepartmentId ?? null,
        cancelledPlacementFrom: input.cancelledPlacementFrom ? toDateColumn(input.cancelledPlacementFrom) : null,
        ...(left ? { leftOn: toDateColumn(left.on), leftAt: new Date(), leftByAppUserId: left.by } : {}),
        recordedByAppUserId: input.recordedByAppUserId,
        recordedByTicketId: input.recordedByTicketId,
        noticeId: input.noticeId ?? null,
      },
    });

    return toRecord(created);
  }

  async find(id: string, tx?: DbTx): Promise<OffboardingRecord | null> {
    const row = await (tx ?? this.prisma).offboardingCase.findUnique({ where: { id } });

    return row && toRecord(row);
  }

  /** The row held `FOR UPDATE` until the transaction ends, read after the lock; null when there is none. */
  async lock(tx: DbTx, id: string): Promise<OffboardingRecord | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM offboarding_cases WHERE id = ${id}::uuid FOR UPDATE`;

    return rows.length === 0 ? null : this.find(id, tx);
  }

  /** The case of the person that is not cancelled: a handover under way or a departure (at most one: a partial unique index). */
  async findLiveOf(tx: DbTx, employeeId: string): Promise<OffboardingRecord | null> {
    const row = await tx.offboardingCase.findFirst({
      where: { employeeId, state: { in: ['HANDING_OVER', 'LEFT'] } },
    });

    return row && toRecord(row);
  }

  /** Whether another waiting transfer names the person to follow the head of its department: they cannot leave before it is settled. */
  async isNamedSuccessorOfPendingTransfer(tx: DbTx, employeeId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM department_transfers
       WHERE status = 'PENDING' AND head_handover ->> 'successorEmployeeId' = ${employeeId} LIMIT 1`;

    return rows.length > 0;
  }

  /** Moves the last working day of a handover under way with the periods that follow it. */
  async reschedule(
    tx: DbTx,
    id: string,
    to: {
      lastWorkingDay: BusinessDate;
      departureEffectiveOn: BusinessDate;
      handoverDueOn: BusinessDate | null;
      headHandover: HeadHandoverFacts | null;
      placementClosedId: string | null;
      cancelledPlacementId?: string | null;
      cancelledPlacementDepartmentId?: string | null;
      cancelledPlacementFrom?: BusinessDate | null;
    },
  ): Promise<OffboardingRecord> {
    const row = await tx.offboardingCase.update({
      where: { id },
      data: {
        lastWorkingDay: toDateColumn(to.lastWorkingDay),
        departureEffectiveOn: toDateColumn(to.departureEffectiveOn),
        handoverDueOn: to.handoverDueOn ? toDateColumn(to.handoverDueOn) : null,
        headHandover: offboardingHeadHandoverJson.encode(to.headHandover),
        placementClosedId: to.placementClosedId,
      },
    });

    return toRecord(row);
  }

  async cancel(
    tx: DbTx,
    id: string,
    by: { appUserId: string | null; ticketId: string | null; reason: string },
  ): Promise<OffboardingRecord> {
    const row = await tx.offboardingCase.update({
      where: { id },
      data: {
        state: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByAppUserId: by.appUserId,
        cancelledByTicketId: by.ticketId,
        cancelReason: by.reason,
      },
    });

    return toRecord(row);
  }

  async markLeft(tx: DbTx, id: string, by: { appUserId: string; leftOn: BusinessDate }): Promise<OffboardingRecord> {
    const row = await tx.offboardingCase.update({
      where: { id },
      data: { state: 'LEFT', leftOn: toDateColumn(by.leftOn), leftAt: new Date(), leftByAppUserId: by.appUserId },
    });

    return toRecord(row);
  }

  /** Writes the lock of the account once; false when it was written meanwhile. */
  async recordAccountLock(tx: DbTx, id: string, by: { appUserId: string; note: string }): Promise<boolean> {
    const done = await tx.offboardingCase.updateMany({
      where: { id, state: { in: ['HANDING_OVER', 'LEFT'] }, accountLockAt: null },
      data: { accountLockAt: new Date(), accountLockByAppUserId: by.appUserId, accountLockNote: by.note },
    });

    return done.count === 1;
  }

  /** Closes the case once; false when it was closed meanwhile. */
  async close(tx: DbTx, id: string, appUserId: string): Promise<boolean> {
    const done = await tx.offboardingCase.updateMany({
      where: { id, state: 'LEFT', closedAt: null },
      data: { closedAt: new Date(), closedByAppUserId: appUserId },
    });

    return done.count === 1;
  }

  async insertChange(
    tx: DbTx,
    input: {
      caseId: string;
      kind: OffboardingChangeKind;
      oldLastWorkingDay?: BusinessDate | null;
      newLastWorkingDay?: BusinessDate | null;
      reason?: string | null;
      detail?: ChangeDetail | null;
      changedByAppUserId: string | null;
      changedByTicketId: string | null;
    },
  ): Promise<void> {
    await tx.offboardingCaseChange.create({
      data: {
        id: randomUUID(),
        caseId: input.caseId,
        kind: input.kind,
        oldLastWorkingDay: input.oldLastWorkingDay ? toDateColumn(input.oldLastWorkingDay) : null,
        newLastWorkingDay: input.newLastWorkingDay ? toDateColumn(input.newLastWorkingDay) : null,
        reason: input.reason ?? null,
        detail: offboardingChangeDetailJson.encode(input.detail ?? null),
        changedByAppUserId: input.changedByAppUserId,
        changedByTicketId: input.changedByTicketId,
      },
    });
  }

  /** The seats the case asked to have revoked, from the log of what it did (distinct, in no order). */
  async openedAssignmentIds(caseId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ id: string }[]>`
      SELECT DISTINCT jsonb_array_elements_text(detail -> 'assignmentIds') AS id
        FROM offboarding_case_changes WHERE case_id = ${caseId}::uuid AND kind = 'REVOCATIONS_OPENED'`;

    return rows.map((row) => row.id);
  }

  /** One page of the log of a case, oldest first, and its total, from one snapshot. */
  async listChanges(
    caseId: string,
    page: { page: number; pageSize: number },
  ): Promise<{ items: OffboardingChangeRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.offboardingCaseChange.findMany({
          where: { caseId },
          orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        });

        return {
          items: rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            oldLastWorkingDay: date(row.oldLastWorkingDay),
            newLastWorkingDay: date(row.newLastWorkingDay),
            reason: row.reason,
            detail: offboardingChangeDetailJson.decode(row.detail),
            changedByAppUserId: row.changedByAppUserId,
            changedByTicketId: row.changedByTicketId,
            changedAt: row.changedAt,
          })),
          total: await tx.offboardingCaseChange.count({ where: { caseId } }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
