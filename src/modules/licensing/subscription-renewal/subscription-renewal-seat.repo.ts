import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { HeldSeat, SeatsNeededFacts } from './subscription-renewal.types';

interface RawSeat {
  assignment_id: string;
  employee_id: string;
  kind: 'PERSONAL' | 'SERVICE';
  valid_from: string;
  valid_until: string | null;
  expected_end_date: string | null;
  live_sources: string[] | null;
  has_open_task: boolean;
}

/** The task states that are still worked or waiting: a seat with one is not carried until the task ends. */
const OPEN_TASK_STATES = ['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'FAILED'];
/** The revocation states that still mean the seat is being taken back. */
const LIVE_REVOCATION_STATES = ['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'FAILED', 'COMPLETED'];

/**
 * The seats of a subscription as its renewal reads them: who holds one, whether a revocation is under way and why, and whether a
 * task is still open. Carrying the seats held on the first day of a new period to that period (`QĐ-35c`) is the work of
 * `AssignmentRenewalService.carry`, the one writer of the carried seats. The database keeps the seats bought (INV-01).
 */
@Injectable()
export class SubscriptionRenewalSeatRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The seats of the subscription not ended by `day` (begun or to begin), personal and service accounts, oldest first, with the
   * sources of a revocation under way. A seat that failed or was cancelled holds nothing and is absent.
   */
  async notEndedBy(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<HeldSeat[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<RawSeat[]>`
      SELECT a.id AS assignment_id, a.employee_id, a.kind::text AS kind,
             to_char(a.valid_from, 'YYYY-MM-DD') AS valid_from,
             to_char(a.valid_until, 'YYYY-MM-DD') AS valid_until,
             to_char(a.expected_end_date, 'YYYY-MM-DD') AS expected_end_date,
             (SELECT array_agg(DISTINCT r.source::text ORDER BY r.source::text)
                FROM provisioning_tasks t JOIN provisioning_task_reasons r ON r.task_id = t.id
               WHERE t.assignment_id = a.id AND t.kind = 'REVOKE' AND r.withdrawn_at IS NULL
                 AND t.status::text = ANY(${LIVE_REVOCATION_STATES}::text[])) AS live_sources,
             EXISTS (SELECT 1 FROM provisioning_tasks t
                      WHERE t.assignment_id = a.id AND t.status::text = ANY(${OPEN_TASK_STATES}::text[])) AS has_open_task
        FROM license_assignments a
       WHERE a.subscription_id = ${subscriptionId}::uuid
         AND a.failed_at IS NULL AND a.cancelled_at IS NULL
         AND (a.valid_until IS NULL OR a.valid_until > ${day}::date)
       ORDER BY a.valid_from, a.id`;

    return rows.map((row) => ({
      assignmentId: row.assignment_id,
      employeeId: row.employee_id,
      kind: row.kind,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      expectedEndDate: row.expected_end_date,
      liveRevocationSources: row.live_sources ?? [],
      hasOpenTask: row.has_open_task,
    }));
  }

  /** How many seats each subscription holds on `day`, in one read; a subscription with none is absent. */
  async countHeldOn(subscriptionIds: readonly string[], day: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    if (subscriptionIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).$queryRaw<{ subscription_id: string; held: number }[]>`
      SELECT a.subscription_id, count(*)::int AS held
        FROM license_assignments a
       WHERE a.subscription_id = ANY(${[...subscriptionIds]}::uuid[])
         AND a.failed_at IS NULL AND a.cancelled_at IS NULL
         AND a.valid_from <= ${day}::date AND (a.valid_until IS NULL OR a.valid_until > ${day}::date)
       GROUP BY a.subscription_id`;

    return new Map(rows.map((row) => [row.subscription_id, row.held]));
  }

  /**
   * The seats of the subscription as the count of the seats its next period needs reads them (`SBF-20` §4.3), in one statement: the
   * ones held past `renewalOn`, the ones in effect today that end by it, and the ones not ended today. The last day of a seat is the
   * earlier of the day before `valid_until` and `expected_end_date` (none: it does not end); a seat with a revocation under way is
   * counted only among the seats not ended today. The requests approved and waiting for their grant hold no seat yet: the module of
   * requests counts them (`RenewalHold.approvedAwaitingGrantOfPlan`).
   */
  async seatsNeededFacts(
    subscriptionId: string,
    days: { today: BusinessDate; renewalOn: BusinessDate },
    tx?: DbTx,
  ): Promise<SeatsNeededFacts> {
    const [row] = await (tx ?? this.prisma).$queryRaw<
      { held_past_renewal: number; ending_ids: string[]; active_today: number }[]
    >`
      WITH seats AS (
        SELECT a.id, a.valid_from, a.valid_until, LEAST(a.valid_until - 1, a.expected_end_date) AS last_day,
               EXISTS (SELECT 1 FROM provisioning_tasks t JOIN provisioning_task_reasons r ON r.task_id = t.id
                        WHERE t.assignment_id = a.id AND t.kind = 'REVOKE' AND r.withdrawn_at IS NULL
                          AND t.status::text = ANY(${LIVE_REVOCATION_STATES}::text[])) AS being_taken_back
          FROM license_assignments a
         WHERE a.subscription_id = ${subscriptionId}::uuid AND a.failed_at IS NULL AND a.cancelled_at IS NULL)
      SELECT count(*) FILTER (WHERE NOT being_taken_back AND (last_day IS NULL OR last_day > ${days.renewalOn}::date))::int
               AS held_past_renewal,
             COALESCE(array_agg(id::text ORDER BY valid_from, id) FILTER (
               WHERE NOT being_taken_back AND last_day <= ${days.renewalOn}::date AND valid_from <= ${days.today}::date
                 AND (valid_until IS NULL OR valid_until > ${days.today}::date)), '{}') AS ending_ids,
             count(*) FILTER (WHERE valid_until IS NULL OR valid_until > ${days.today}::date)::int AS active_today
        FROM seats`;

    return {
      heldPastRenewal: row.held_past_renewal,
      endingAssignmentIds: row.ending_ids,
      activeSeatsToday: row.active_today,
    };
  }
}
