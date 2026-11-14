import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { HeldSeat } from './subscription-renewal.types';

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
 * The seats of a subscription as its renewal reads and carries them: who holds one, whether a revocation is under way and why,
 * whether a task is still open, and the carrying of the seats held on the first day of a new period to that period, each new seat
 * naming the one it continues (`QĐ-35c`). The database keeps the seats bought (INV-01) and the one seat of a person (INV-02).
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
   * Carries the seats to the new period in the caller's transaction: a new seat on the new subscription from its first day for
   * each, naming the seat it continues and keeping its person, account, Cost Center, expected end and the flag of a machine account with its
   * reason (a flagged seat that lost its flag would break INV-02 beside the personal seat of the same IT Admin); then each old seat ends that
   * day, so no day has the person twice or not at all. Returns how many were carried.
   */
  async carry(
    tx: DbTx,
    input: {
      assignmentIds: readonly string[];
      nextSubscriptionId: string;
      startDate: BusinessDate;
      actorAppUserId: string;
    },
  ): Promise<number> {
    if (input.assignmentIds.length === 0) return 0;
    const ids = [...input.assignmentIds];
    const inserted = await tx.$executeRaw`
      INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
             account_identifier, normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from,
             valid_from_basis, valid_until, expected_end_date, predecessor_id, created_by_app_user_id, is_machine_account,
             machine_account_note)
      SELECT gen_random_uuid(), a.organization_id, a.kind, 'RENEWAL_CARRY', a.plan_id, ${input.nextSubscriptionId}::uuid,
             a.employee_id, a.account_identifier, a.normalized_account_identifier, a.reason, a.cost_center_id,
             a.owning_department_id, ${input.startDate}::date, 'RECORDED',
             CASE WHEN a.valid_until > ${input.startDate}::date THEN a.valid_until END, a.expected_end_date, a.id,
             ${input.actorAppUserId}::uuid, a.is_machine_account, a.machine_account_note
        FROM license_assignments a
       WHERE a.id = ANY(${ids}::uuid[])
       ORDER BY a.valid_from, a.id`;
    await tx.$executeRaw`
      UPDATE license_assignments SET valid_until = ${input.startDate}::date
       WHERE id = ANY(${ids}::uuid[])`;

    return inserted;
  }
}
