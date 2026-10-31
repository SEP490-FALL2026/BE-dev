import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  DeadlineEventRecord,
  DeadlineOutcome,
  DecisionSnapshot,
  DecisionWrite,
  NewRenewal,
  OutcomeWrite,
  ReleasedSeat,
  RenewalRecord,
  RenewalState,
  SeatRankGroup,
} from './subscription-renewal.types';

type Row = Prisma.SubscriptionRenewalGetPayload<object>;
type EventRow = Prisma.SubscriptionDeadlineEventGetPayload<object>;

function decisionOf(row: Row): RenewalRecord['decision'] {
  if (
    row.decidedChoice === null ||
    row.decidedByEmployeeId === null ||
    row.decidedAt === null ||
    row.decidedOn === null ||
    row.executionPoint === null
  ) {
    return null;
  }

  return {
    choice: row.decidedChoice,
    quantity: row.decidedQuantity,
    reason: row.decisionReason,
    decidedByEmployeeId: row.decidedByEmployeeId,
    deciderRole: row.deciderRole === 'CONFLICT_SUBSTITUTE' ? 'CONFLICT_SUBSTITUTE' : 'SPENDING_APPROVER',
    decidedAt: row.decidedAt,
    decidedOn: fromDateColumn(row.decidedOn),
    decidedAfterDeadline: row.decidedAfterDeadline === true,
    executionPoint: row.executionPoint,
    activeSeatsAtDecision: row.activeSeatsAtDecision ?? 0,
    snapshot: row.decisionSnapshot as unknown as DecisionSnapshot,
  };
}

function outcomeOf(row: Row): RenewalRecord['outcome'] {
  if (row.outcome === null || row.outcomeRecordedByEmployeeId === null || row.outcomeRecordedAt === null) return null;

  return {
    kind: row.outcome,
    note: row.outcomeNote,
    recordedByEmployeeId: row.outcomeRecordedByEmployeeId,
    recordedAt: row.outcomeRecordedAt,
    vendorFollowUpOpen: row.vendorFollowUpOpen,
    nextSubscriptionId: row.nextSubscriptionId,
    realisedSavings:
      row.realisedSavingsMinor !== null && row.realisedSavingsCurrency !== null
        ? { amountMinor: row.realisedSavingsMinor, currency: row.realisedSavingsCurrency }
        : null,
  };
}

function toRecord(row: Row): RenewalRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subscriptionId: row.subscriptionId,
    state: row.state,
    noticeBasis: row.noticeBasis,
    noticeBaseDate: fromDateColumn(row.noticeBaseDate),
    proposedChoice: row.proposedChoice,
    proposedQuantity: row.proposedQuantity,
    proposalNote: row.proposalNote,
    businessOwnerOpinion: row.businessOwnerOpinion,
    proposedByEmployeeId: row.proposedByEmployeeId,
    proposedAt: row.proposedAt,
    decision: decisionOf(row),
    lateFlaggedAt: row.lateFlaggedAt,
    outcome: outcomeOf(row),
  };
}

function toEvent(row: EventRow): DeadlineEventRecord {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    kind: row.kind,
    noticeBaseDate: fromDateColumn(row.noticeBaseDate),
    autoRenewAtTime: row.autoRenewAtTime,
    recordedOn: fromDateColumn(row.recordedOn),
    recordedAt: row.recordedAt,
  };
}

/**
 * The one writer of `subscription_renewals`, `subscription_renewal_released_seats` and `subscription_deadline_events`: a case of a
 * period proposed once, decided once and given its outcome once (the database freezes each stage), the seats chosen with a
 * decision, and the one event of a milestone that passed with no decision.
 */
@Injectable()
export class SubscriptionRenewalRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the proposal; null when the period already has a case (one per period, the unique index decides a race). */
  async insert(tx: DbTx, input: NewRenewal): Promise<RenewalRecord | null> {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO subscription_renewals (id, organization_id, subscription_id, notice_basis, notice_base_date, proposed_choice,
             proposed_quantity, proposal_note, business_owner_opinion, proposed_by_employee_id, proposed_by_app_user_id,
             updated_at)
      VALUES (gen_random_uuid(), ${input.organizationId}::uuid, ${input.subscriptionId}::uuid,
              ${input.noticeBasis}::"RenewalNoticeBasis", ${input.noticeBaseDate}::date,
              ${input.proposedChoice}::"RenewalChoice", ${input.proposedQuantity}::int, ${input.proposalNote},
              ${input.businessOwnerOpinion}, ${input.proposedByEmployeeId}::uuid, ${input.proposedByAppUserId}::uuid, now())
      ON CONFLICT (subscription_id) DO NOTHING
      RETURNING id`;
    if (inserted.length === 0) return null;

    return this.find(inserted[0].id, tx);
  }

  async find(id: string, tx?: DbTx): Promise<RenewalRecord | null> {
    const row = await (tx ?? this.prisma).subscriptionRenewal.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The case, locked `FOR UPDATE` until the transaction ends, or null: what serializes a decision and an outcome of one case. */
  async lock(tx: DbTx, id: string): Promise<RenewalRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscription_renewals WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  /** The case of each of these periods, by subscription id; a period without one is absent. */
  async ofSubscriptions(subscriptionIds: readonly string[], tx?: DbTx): Promise<Map<string, RenewalRecord>> {
    if (subscriptionIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).subscriptionRenewal.findMany({
      where: { subscriptionId: { in: [...subscriptionIds] } },
    });

    return new Map(rows.map((row) => [row.subscriptionId, toRecord(row)]));
  }

  async recordDecision(tx: DbTx, id: string, decision: DecisionWrite): Promise<RenewalRecord> {
    const row = await tx.subscriptionRenewal.update({
      where: { id },
      data: {
        state: 'DECIDED',
        decidedChoice: decision.choice,
        decidedQuantity: decision.quantity,
        decisionReason: decision.reason,
        decidedByEmployeeId: decision.decidedByEmployeeId,
        decidedByAppUserId: decision.decidedByAppUserId,
        deciderRole: decision.deciderRole,
        decidedAt: decision.decidedAt,
        decidedOn: toDateColumn(decision.decidedOn),
        decidedAfterDeadline: decision.decidedAfterDeadline,
        executionPoint: decision.executionPoint,
        activeSeatsAtDecision: decision.activeSeatsAtDecision,
        decisionSnapshot: decision.snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return toRecord(row);
  }

  async insertReleased(tx: DbTx, renewalId: string, seats: readonly ReleasedSeat[]): Promise<void> {
    if (seats.length === 0) return;
    await tx.subscriptionRenewalReleasedSeat.createMany({
      data: seats.map((seat) => ({
        renewalId,
        assignmentId: seat.assignmentId,
        rankGroup: seat.rankGroup,
        position: seat.position,
      })),
    });
  }

  /** The seats chosen with the decision of the case, in the order of the ranking they were chosen from. */
  async releasedOf(renewalId: string, tx?: DbTx): Promise<ReleasedSeat[]> {
    const rows = await (tx ?? this.prisma).subscriptionRenewalReleasedSeat.findMany({
      where: { renewalId },
      orderBy: { position: 'asc' },
    });

    return rows.map((row) => ({
      assignmentId: row.assignmentId,
      rankGroup: row.rankGroup as SeatRankGroup,
      position: row.position,
    }));
  }

  /** Sets the late flag of a decided case once; false when it was set already or the case is no longer waiting for its outcome. */
  async flagLate(tx: DbTx, id: string, at: Date): Promise<boolean> {
    const { count } = await tx.subscriptionRenewal.updateMany({
      where: { id, state: 'DECIDED', lateFlaggedAt: null },
      data: { lateFlaggedAt: at },
    });

    return count === 1;
  }

  async recordOutcome(tx: DbTx, id: string, outcome: OutcomeWrite): Promise<RenewalRecord> {
    const row = await tx.subscriptionRenewal.update({
      where: { id },
      data: {
        state: 'OUTCOME_RECORDED',
        outcome: outcome.kind,
        outcomeNote: outcome.note,
        outcomeRecordedByEmployeeId: outcome.recordedByEmployeeId,
        outcomeRecordedByAppUserId: outcome.recordedByAppUserId,
        outcomeRecordedAt: outcome.recordedAt,
        vendorFollowUpOpen: outcome.vendorFollowUpOpen,
        nextSubscriptionId: outcome.nextSubscriptionId,
        realisedSavingsMinor: outcome.realisedSavings?.amountMinor ?? null,
        realisedSavingsCurrency: outcome.realisedSavings?.currency ?? null,
      },
    });

    return toRecord(row);
  }

  /** One page of cases, the earliest milestone first, and the total of the same filter. */
  async page(
    filter: { state?: RenewalState; subscriptionId?: string; late?: boolean },
    skip: number,
    take: number,
  ): Promise<{ items: RenewalRecord[]; total: number }> {
    const where: Prisma.SubscriptionRenewalWhereInput = {
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
      ...(filter.late === undefined ? {} : { lateFlaggedAt: filter.late ? { not: null } : null }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.subscriptionRenewal.findMany({
        where,
        orderBy: [{ noticeBaseDate: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.subscriptionRenewal.count({ where }),
    ]);

    return { items: rows.map(toRecord), total };
  }

  /** Writes the event of a passed milestone once per period; false when the period has one already. */
  async insertDeadlineEvent(
    tx: DbTx,
    input: {
      organizationId: string;
      subscriptionId: string;
      kind: DeadlineOutcome;
      noticeBaseDate: BusinessDate;
      autoRenewAtTime: boolean;
      recordedOn: BusinessDate;
    },
  ): Promise<DeadlineEventRecord | null> {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO subscription_deadline_events (id, organization_id, subscription_id, kind, notice_base_date,
             auto_renew_at_time, recorded_on)
      VALUES (gen_random_uuid(), ${input.organizationId}::uuid, ${input.subscriptionId}::uuid,
              ${input.kind}::"RenewalDeadlineOutcome", ${input.noticeBaseDate}::date, ${input.autoRenewAtTime},
              ${input.recordedOn}::date)
      ON CONFLICT (subscription_id) DO NOTHING
      RETURNING id`;
    if (inserted.length === 0) return null;
    const row = await tx.subscriptionDeadlineEvent.findUniqueOrThrow({ where: { id: inserted[0].id } });

    return toEvent(row);
  }

  /** The event of each of these periods, by subscription id; a period without one is absent. */
  async deadlineEventsOf(subscriptionIds: readonly string[], tx?: DbTx): Promise<Map<string, DeadlineEventRecord>> {
    if (subscriptionIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).subscriptionDeadlineEvent.findMany({
      where: { subscriptionId: { in: [...subscriptionIds] } },
    });

    return new Map(rows.map((row) => [row.subscriptionId, toEvent(row)]));
  }

  /** One page of the events, the newest first, and the total; filtered by kind and by the day recorded. */
  async pageDeadlineEvents(
    filter: { kind?: DeadlineOutcome; from?: BusinessDate; to?: BusinessDate },
    skip: number,
    take: number,
  ): Promise<{ items: DeadlineEventRecord[]; total: number }> {
    const recordedOn = {
      ...(filter.from ? { gte: toDateColumn(filter.from) } : {}),
      ...(filter.to ? { lte: toDateColumn(filter.to) } : {}),
    };
    const where: Prisma.SubscriptionDeadlineEventWhereInput = {
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.from || filter.to ? { recordedOn } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.subscriptionDeadlineEvent.findMany({
        where,
        orderBy: [{ recordedOn: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.subscriptionDeadlineEvent.count({ where }),
    ]);

    return { items: rows.map(toEvent), total };
  }
}
