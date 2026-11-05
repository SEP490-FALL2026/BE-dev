import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export type SpendStepKind = 'FINANCE_REVIEW' | 'SPEND_APPROVAL';
export type SpendStepState = 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CLOSED';

/** The row of the routing table of `US-05-03` that gave the step: none, the roles name the holder. */
const NOT_ROUTED = 9;

export interface SpendStepRecord {
  id: string;
  requestId: string;
  kind: SpendStepKind;
  sequence: number;
  state: SpendStepState;
  assigneeEmployeeId: string | null;
  waitingReason: string | null;
  samePersonAsSpend: boolean;
  noIndependentReview: boolean;
  slaWorkingDays: number;
  createdAt: Date;
  assignedAt: Date | null;
  decidedAt: Date | null;
}

export interface NewSpendStep {
  requestId: string;
  kind: SpendStepKind;
  /** Null when nobody valid holds it: the step waits and says why. */
  assigneeEmployeeId: string | null;
  waitingReason: string | null;
  samePersonAsSpend?: boolean;
  noIndependentReview?: boolean;
  slaWorkingDays: number;
  now: Date;
}

const toRecord = (row: {
  id: string;
  requestId: string;
  kind: string;
  sequence: number;
  state: string;
  assigneeEmployeeId: string | null;
  waitingReason: string | null;
  samePersonAsSpend: boolean;
  noIndependentReview: boolean;
  slaWorkingDays: number;
  createdAt: Date;
  assignedAt: Date | null;
  decidedAt: Date | null;
}): SpendStepRecord => ({ ...row, kind: row.kind as SpendStepKind, state: row.state as SpendStepState });

/**
 * The review step of Finance and the spend step of the spending approver in `access_request_steps`, which the other repos
 * of the module do not know. At most one of each is open for a request, and the database refuses a second.
 */
@Injectable()
export class SpendStepRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Opens a step after the ones the request has. */
  async open(tx: DbTx, input: NewSpendStep): Promise<SpendStepRecord> {
    const last = await tx.accessRequestStep.aggregate({
      where: { requestId: input.requestId },
      _max: { sequence: true },
    });
    const held = input.assigneeEmployeeId !== null;
    const row = await tx.accessRequestStep.create({
      data: {
        requestId: input.requestId,
        kind: input.kind,
        sequence: (last._max.sequence ?? 0) + 1,
        state: held ? 'PENDING' : 'WAITING',
        assigneeEmployeeId: input.assigneeEmployeeId,
        routingRow: NOT_ROUTED,
        waitingReason: held ? null : input.waitingReason,
        samePersonAsSpend: input.samePersonAsSpend ?? false,
        noIndependentReview: input.noIndependentReview ?? false,
        slaWorkingDays: input.slaWorkingDays,
        createdAt: input.now,
        assignedAt: held ? input.now : null,
      },
    });

    return toRecord(row);
  }

  /** The step of this kind that is open (held or waiting), if any. */
  async findOpen(requestId: string, kind: SpendStepKind, tx?: DbTx): Promise<SpendStepRecord | null> {
    const row = await (tx ?? this.prisma).accessRequestStep.findFirst({
      where: { requestId, kind, state: { in: ['PENDING', 'WAITING'] } },
    });

    return row ? toRecord(row) : null;
  }

  /** Whether any step of the request is open (held or waiting), whatever its kind. */
  async hasOpenStep(requestId: string, tx?: DbTx): Promise<boolean> {
    const row = await (tx ?? this.prisma).accessRequestStep.findFirst({
      where: { requestId, state: { in: ['PENDING', 'WAITING'] } },
      select: { id: true },
    });

    return row !== null;
  }

  /** The newest step of this kind, open or not. */
  async findLatest(requestId: string, kind: SpendStepKind, tx?: DbTx): Promise<SpendStepRecord | null> {
    const row = await (tx ?? this.prisma).accessRequestStep.findFirst({
      where: { requestId, kind },
      orderBy: { sequence: 'desc' },
    });

    return row ? toRecord(row) : null;
  }

  /**
   * Ends a step without approving or refusing it. A step that is completed was held by the person who completes it: one that
   * waited for a holder is taken by them. A closed step keeps whoever held it, which may be nobody.
   */
  async end(tx: DbTx, step: SpendStepRecord, state: 'COMPLETED' | 'CLOSED', employeeId: string | null, now: Date) {
    const takenBy = step.assigneeEmployeeId ?? (state === 'COMPLETED' ? employeeId : null);
    await tx.accessRequestStep.update({
      where: { id: step.id },
      data: {
        state,
        decidedAt: now,
        waitingReason: null,
        assigneeEmployeeId: takenBy,
        assignedAt: step.assignedAt ?? (takenBy === null ? null : now),
      },
    });
  }

  /**
   * Closes every step of the request that is still open, whatever its kind: the request ended without them being decided
   * (`US-05-08`). A closed step keeps whoever held it, which may be nobody.
   */
  async closeAllOpen(tx: DbTx, requestId: string, now: Date): Promise<void> {
    await tx.accessRequestStep.updateMany({
      where: { requestId, state: { in: ['PENDING', 'WAITING'] } },
      data: { state: 'CLOSED', decidedAt: now, waitingReason: null },
    });
  }

  /**
   * Closes the open need steps of a request for a group that no person waits on any more: everybody of the step was withdrawn or
   * left out, so there is nothing for its holder to decide and nothing to remind them of (`US-05-17`).
   */
  async closeNeedStepsWithoutPeople(tx: DbTx, requestId: string, now: Date): Promise<void> {
    await tx.$executeRaw`
      UPDATE access_request_steps s
         SET state = 'CLOSED'::"AccessRequestStepState", decided_at = ${now}, waiting_reason = NULL
       WHERE s.request_id = ${requestId}::uuid AND s.kind = 'NEED' AND s.state IN ('PENDING', 'WAITING')
         AND EXISTS (SELECT 1 FROM access_request_lines l WHERE l.need_step_id = s.id)
         AND NOT EXISTS (SELECT 1 FROM access_request_lines l WHERE l.need_step_id = s.id AND l.state = 'AWAITING_NEED')`;
  }

  /**
   * Flags the need steps held by the same person as the spend step (`US-05-03` AC-9): a request has one, and a request for a group
   * has two, which different people hold, so only the step this person holds is flagged (`US-06-14` AC-6).
   */
  async flagSamePerson(tx: DbTx, requestId: string, employeeId: string): Promise<void> {
    await tx.accessRequestStep.updateMany({
      where: { requestId, kind: 'NEED', assigneeEmployeeId: employeeId },
      data: { samePersonAsSpend: true },
    });
  }

  /** The open review steps, oldest first, with what the queue of Finance shows of each request. */
  async pageOpenReviews(skip: number, take: number, state?: 'PENDING' | 'WAITING') {
    const where = { kind: 'FINANCE_REVIEW' as const, state: state ?? { in: ['PENDING' as const, 'WAITING' as const] } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accessRequestStep.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          id: true,
          requestId: true,
          state: true,
          waitingReason: true,
          createdAt: true,
          slaWorkingDays: true,
          request: {
            select: {
              costCenterId: true,
              requesterEmployeeId: true,
              planId: true,
              amountMinor: true,
              amountCurrency: true,
            },
          },
        },
      }),
      this.prisma.accessRequestStep.count({ where }),
    ]);

    return { rows, total };
  }

  /** The spend steps given to a person that are open (`PENDING`), oldest first, with what the queue of the approver shows. */
  async pageOpenSpendOf(employeeId: string, skip: number, take: number) {
    const where = openSpendWhere(employeeId);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accessRequestStep.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          id: true,
          requestId: true,
          createdAt: true,
          slaWorkingDays: true,
          samePersonAsSpend: true,
          noIndependentReview: true,
          request: {
            select: {
              planId: true,
              costCenterId: true,
              requesterEmployeeId: true,
              amountMinor: true,
              amountCurrency: true,
              offPlan: true,
              type: true,
              proposal: { select: { softwareName: true } },
              beneficiaries: { select: { employeeId: true }, orderBy: { position: 'asc' }, take: 1 },
              _count: { select: { beneficiaries: true } },
            },
          },
        },
      }),
      this.prisma.accessRequestStep.count({ where }),
    ]);

    return { rows, total };
  }

  /**
   * The first `take` spend steps the queue of the approver holds for the person, the earliest given first (`id` breaks ties), with
   * the whole reason of each request, and how many there are in all. Reads only; takes no row lock.
   */
  async firstGivenOpenSpendOf(employeeId: string, take: number, tx?: DbTx) {
    const client = tx ?? this.prisma;
    const where = openSpendWhere(employeeId);

    return {
      rows: await client.accessRequestStep.findMany({
        where,
        orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
        take,
        select: {
          id: true,
          requestId: true,
          assignedAt: true,
          request: {
            select: {
              type: true,
              planId: true,
              businessReason: true,
              termMonths: true,
              amountMinor: true,
              amountCurrency: true,
              proposal: { select: { softwareName: true } },
              beneficiaries: { select: { employeeId: true }, orderBy: { position: 'asc' }, take: 1 },
              _count: { select: { beneficiaries: true } },
            },
          },
        },
      }),
      total: await client.accessRequestStep.count({ where }),
    };
  }

  /** Which of the steps are spend steps the queue of the approver holds for the person now. */
  async openSpendAmong(employeeId: string, stepIds: readonly string[], tx?: DbTx): Promise<string[]> {
    if (stepIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).accessRequestStep.findMany({
      where: { ...openSpendWhere(employeeId), id: { in: [...stepIds] } },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }
}

/** The spend steps that wait for a person: given to them and pending. One filter for the queue, its summary and its check. */
function openSpendWhere(employeeId: string) {
  return { kind: 'SPEND_APPROVAL' as const, assigneeEmployeeId: employeeId, state: 'PENDING' as const };
}
