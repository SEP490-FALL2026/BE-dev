import { Injectable } from '@nestjs/common';
import { type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SlaStepKind } from './step-sla.policy';

/** A step a pass looks at before it takes the lock: enough to know whether it can be late. */
export interface StepCandidate {
  stepId: string;
  createdAt: Date;
  slaWorkingDays: number;
}

/** A step as found under its lock: what the reminder reads and writes about. */
export interface LockedStep {
  stepId: string;
  requestId: string;
  organizationId: string;
  departmentId: string;
  kind: SlaStepKind;
  state: 'PENDING' | 'WAITING';
  assigneeEmployeeId: string | null;
  createdAt: Date;
  slaWorkingDays: number;
}

/** A request in the queue of the head for submission, before and after the lock. */
export interface QueueCandidate {
  requestId: string;
  queuedAt: Date;
}

export interface LockedQueueRequest {
  requestId: string;
  organizationId: string;
  departmentId: string;
  queuedAt: Date;
}

/** Where a page of candidates stops: the next page starts after this step or request. */
export interface CandidateCursor {
  at: Date;
  id: string;
}

interface StepCandidateRow {
  id: string;
  created_at: Date;
  sla_working_days: number;
}

interface LockedStepRow {
  id: string;
  request_id: string;
  organization_id: string;
  department_id: string;
  kind: SlaStepKind;
  state: 'PENDING' | 'WAITING';
  assignee_employee_id: string | null;
  created_at: Date;
  sla_working_days: number;
}

/**
 * What the reminders look at, and nothing they write: the open steps and the requests in the queue of the head, oldest first, and
 * the lock on the one a pass is about to remind about. The lock is `FOR UPDATE SKIP LOCKED` on that one row, so a worker that
 * meets one that is held (by another worker or by a person deciding the step) leaves it for the next pass, and a pass never waits
 * on a decision. It takes no other lock, so it cannot make a cycle with the decision that locks the request and then the step.
 */
@Injectable()
export class SlaSubjectRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The open steps that may be late and have no reminder for `today`, oldest first, after the cursor. The bound on the creation is
   * safe, not exact: a deadline is never earlier than the day count of the step in calendar days (less one day of slack for a
   * change of the clocks), so the working-day arithmetic is left for the pass to do on the few rows that pass it.
   */
  async openStepCandidates(
    now: Date,
    today: BusinessDate,
    after: CandidateCursor | null,
    limit: number,
  ): Promise<StepCandidate[]> {
    const rows = await this.prisma.$queryRaw<StepCandidateRow[]>`
      SELECT s.id, s.created_at, s.sla_working_days
        FROM access_request_steps s
       WHERE s.state IN ('PENDING', 'WAITING')
         AND s.created_at <= ${now}::timestamptz - (s.sla_working_days * interval '1 day') + interval '1 day'
         AND (${after?.at ?? null}::timestamptz IS NULL OR (s.created_at, s.id) > (${after?.at ?? null}::timestamptz, ${after?.id ?? null}::uuid))
         AND NOT EXISTS (
           SELECT 1 FROM step_sla_reminders r
            WHERE r.subject_kind = 'STEP' AND r.subject_id = s.id AND r.business_date = ${today}::date)
       ORDER BY s.created_at, s.id
       LIMIT ${limit}`;

    return rows.map((row) => ({ stepId: row.id, createdAt: row.created_at, slaWorkingDays: row.sla_working_days }));
  }

  /** Takes the lock on a step that is still open; null when it was closed meanwhile or somebody else holds the lock. */
  async lockOpenStep(tx: DbTx, stepId: string): Promise<LockedStep | null> {
    const rows = await tx.$queryRaw<LockedStepRow[]>`
      SELECT s.id, s.request_id, r.organization_id, r.department_id, s.kind::text AS kind, s.state::text AS state,
             s.assignee_employee_id, s.created_at, s.sla_working_days
        FROM access_request_steps s
        JOIN access_requests r ON r.id = s.request_id
       WHERE s.id = ${stepId}::uuid AND s.state IN ('PENDING', 'WAITING')
         FOR UPDATE OF s SKIP LOCKED`;
    const row = rows[0];

    return row
      ? {
          stepId: row.id,
          requestId: row.request_id,
          organizationId: row.organization_id,
          departmentId: row.department_id,
          kind: row.kind,
          state: row.state,
          assigneeEmployeeId: row.assignee_employee_id,
          createdAt: row.created_at,
          slaWorkingDays: row.sla_working_days,
        }
      : null;
  }

  /** The requests in the queue of their head that have no reminder for `today`, oldest in the queue first, after the cursor. */
  async queueCandidates(today: BusinessDate, after: CandidateCursor | null, limit: number): Promise<QueueCandidate[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; spend_queued_at: Date }[]>`
      SELECT r.id, r.spend_queued_at
        FROM access_requests r
       WHERE r.state = 'AWAITING_SPEND_SUBMISSION'
         AND r.spend_queued_at IS NOT NULL
         AND (r.policy #> '{chain}') @> to_jsonb('SPEND_APPROVAL'::text)
         AND (${after?.at ?? null}::timestamptz IS NULL OR (r.spend_queued_at, r.id) > (${after?.at ?? null}::timestamptz, ${after?.id ?? null}::uuid))
         AND NOT EXISTS (
           SELECT 1 FROM step_sla_reminders x
            WHERE x.subject_kind = 'SPEND_QUEUE' AND x.subject_id = r.id AND x.business_date = ${today}::date)
       ORDER BY r.spend_queued_at, r.id
       LIMIT ${limit}`;

    return rows.map((row) => ({ requestId: row.id, queuedAt: row.spend_queued_at }));
  }

  /** Takes the lock on a request still in the queue; null when it went on meanwhile or somebody else holds the lock. */
  async lockQueuedRequest(tx: DbTx, requestId: string): Promise<LockedQueueRequest | null> {
    const rows = await tx.$queryRaw<
      { id: string; organization_id: string; department_id: string; spend_queued_at: Date }[]
    >`
      SELECT r.id, r.organization_id, r.department_id, r.spend_queued_at
        FROM access_requests r
       WHERE r.id = ${requestId}::uuid AND r.state = 'AWAITING_SPEND_SUBMISSION' AND r.spend_queued_at IS NOT NULL
         FOR UPDATE SKIP LOCKED`;
    const row = rows[0];

    return row
      ? {
          requestId: row.id,
          organizationId: row.organization_id,
          departmentId: row.department_id,
          queuedAt: row.spend_queued_at,
        }
      : null;
  }

  /** The id of the oldest question to Finance still open on the step, or null: the one a reminder to Finance names. */
  async openFinanceQuestion(tx: DbTx, stepId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT q.id FROM budget_information_requests q
       WHERE q.step_id = ${stepId}::uuid AND q.state = 'OPEN'
       ORDER BY q.asked_at, q.id LIMIT 1`;

    return rows[0]?.id ?? null;
  }
}
