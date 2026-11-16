import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/** Where the grant of one person stands, read from the state of the request or of the line of the person: nothing of licensing is read here. */
export type GrantQueueState = 'WAITING' | 'EXECUTING' | 'DONE';

export interface WaitingRequestRow {
  id: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'GROUP_GRANT';
  /** The verdict of the IT Admin on a service account; null for any other request. */
  boundaryState: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  planId: string;
  departmentId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeId: string;
  expectedEndDate: BusinessDate | null;
  submittedAt: Date;
  /** How many people the request is for: 1 but for a request for a group, of which each approved person is a row of their own. */
  lineCount: number;
  state: GrantQueueState;
  /** The requester withdrew while the grant of this person had failed: the IT Admin closes the task as cancelled. */
  withdrawing: boolean;
}

interface QueueRow {
  id: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'GROUP_GRANT';
  boundary_state: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  plan_id: string;
  department_id: string;
  requester_employee_id: string;
  beneficiary_employee_id: string;
  expected_end_date: Date | null;
  submitted_at: Date;
  line_count: number;
  queue_state: GrantQueueState;
  withdrawing: boolean;
}

export interface GrantQueueFilter {
  /** The ids of the units the caller works (their department scope): nothing outside them is read. */
  departmentIds: readonly string[];
  beneficiaryEmployeeId?: string;
  planId?: string;
  state?: GrantQueueState;
}

/**
 * The requests that were approved in full, read as the IT Admin reads them: one row for each person, with where their grant stands
 * (`QĐ-111m`), kept by state (what waits first), then together by the person they are for, then by when they were sent (`US-03-02` AC-6).
 * A request for a group is read as one row for each person whose line is approved or already carried out (`US-05-17` AC-6): each is
 * granted on its own. The state is the one of the request, or of the line of the person, so no table of licensing is read. It only reads.
 */
@Injectable()
export class GrantQueueRepo {
  constructor(private readonly prisma: PrismaService) {}

  async page(
    filter: GrantQueueFilter,
    skip: number,
    take: number,
  ): Promise<{ rows: WaitingRequestRow[]; total: number }> {
    const queue = this.queueOf(filter);
    const where = filter.state ? Prisma.sql`WHERE q.queue_state = ${filter.state}` : Prisma.empty;
    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<QueueRow[]>`
        SELECT * FROM (${queue}) AS q ${where}
         ORDER BY CASE q.queue_state WHEN 'WAITING' THEN 0 WHEN 'EXECUTING' THEN 1 ELSE 2 END,
                  q.beneficiary_employee_id, q.submitted_at, q.id
         LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM (${queue}) AS q ${where}`,
    ]);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        type: row.type,
        boundaryState: row.boundary_state,
        planId: row.plan_id,
        departmentId: row.department_id,
        requesterEmployeeId: row.requester_employee_id,
        beneficiaryEmployeeId: row.beneficiary_employee_id,
        expectedEndDate: row.expected_end_date ? fromDateColumn(row.expected_end_date) : null,
        submittedAt: row.submitted_at,
        lineCount: row.line_count,
        state: row.queue_state,
        withdrawing: row.withdrawing,
      })),
      total: Number(counted[0]?.total ?? 0n),
    };
  }
  /** Every person of every request the caller works that is approved or beyond, with where their grant stands, before the state filter. */
  private queueOf(filter: GrantQueueFilter): Prisma.Sql {
    const scope = [...filter.departmentIds];
    const plan = filter.planId ? Prisma.sql`AND r.plan_id = ${filter.planId}::uuid` : Prisma.empty;
    const single = filter.beneficiaryEmployeeId
      ? Prisma.sql`AND b.employee_id = ${filter.beneficiaryEmployeeId}::uuid`
      : Prisma.empty;
    const grouped = filter.beneficiaryEmployeeId
      ? Prisma.sql`AND l.employee_id = ${filter.beneficiaryEmployeeId}::uuid`
      : Prisma.empty;
    const queue = Prisma.sql`
      SELECT r.id, r.type::text AS type, s.boundary_state::text AS boundary_state, r.plan_id, r.department_id,
             r.requester_employee_id, b.employee_id AS beneficiary_employee_id, r.expected_end_date, r.submitted_at,
             1 AS line_count,
             CASE r.state::text
               WHEN 'AWAITING_EXECUTION' THEN 'WAITING'
               WHEN 'COMPLETED' THEN 'DONE'
               WHEN 'FAILED' THEN 'DONE'
               ELSE 'EXECUTING'
             END AS queue_state,
             (r.state = 'AWAITING_IT_CLOSE') AS withdrawing
        FROM access_requests r
        JOIN access_request_beneficiaries b ON b.request_id = r.id AND b.position = 1
        LEFT JOIN access_request_service_accounts s ON s.request_id = r.id
       WHERE r.type IN ('GRANT', 'SERVICE_ACCOUNT') AND r.plan_id IS NOT NULL
         AND r.state IN ('AWAITING_EXECUTION', 'EXECUTING', 'AWAITING_IT_CLOSE', 'COMPLETED', 'FAILED')
         AND r.department_id = ANY(${scope}::uuid[]) ${plan} ${single}
      UNION ALL
      SELECT r.id, r.type::text AS type, NULL AS boundary_state, r.plan_id, r.department_id,
             r.requester_employee_id, l.employee_id AS beneficiary_employee_id, l.expected_end_date, r.submitted_at,
             (SELECT count(*)::int FROM access_request_beneficiaries n WHERE n.request_id = r.id) AS line_count,
             CASE l.state::text
               WHEN 'APPROVED' THEN 'WAITING'
               WHEN 'COMPLETED' THEN 'DONE'
               WHEN 'FAILED' THEN 'DONE'
               ELSE 'EXECUTING'
             END AS queue_state,
             (l.state = 'AWAITING_IT_CLOSE') AS withdrawing
        FROM access_requests r
        JOIN access_request_lines l ON l.request_id = r.id
       WHERE r.type = 'GROUP_GRANT' AND r.plan_id IS NOT NULL
         AND ((l.state = 'APPROVED' AND r.state IN ('AWAITING_EXECUTION', 'EXECUTING'))
              OR l.state IN ('EXECUTING', 'AWAITING_IT_CLOSE', 'COMPLETED', 'FAILED'))
         AND r.department_id = ANY(${scope}::uuid[]) ${plan} ${grouped}`;

    return queue;
  }
}
