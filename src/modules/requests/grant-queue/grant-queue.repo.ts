import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

export interface WaitingRequestRow {
  id: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'GROUP_GRANT';
  /** The verdict of the IT Admin on a service account; null for any other request. */
  boundaryState: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  planId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeId: string;
  expectedEndDate: BusinessDate | null;
  submittedAt: Date;
  /** How many people the request is for: 1 but for a request for a group, of which each approved person is a row of their own. */
  lineCount: number;
}

interface QueueRow {
  id: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'GROUP_GRANT';
  boundary_state: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  plan_id: string;
  requester_employee_id: string;
  beneficiary_employee_id: string;
  expected_end_date: Date | null;
  submitted_at: Date;
  line_count: number;
}

/**
 * The requests that were approved in full and wait for the IT Admin to carry them out, read as the IT Admin reads them:
 * kept together by the person they are for, then by when they were sent (`US-03-02` AC-6). A request for a group is read as one row
 * for each person whose line is approved and not yet carried out (`US-05-17` AC-6): each is granted on its own. It only reads.
 */
@Injectable()
export class GrantQueueRepo {
  constructor(private readonly prisma: PrismaService) {}

  async page(
    filter: { beneficiaryEmployeeId?: string },
    skip: number,
    take: number,
  ): Promise<{ rows: WaitingRequestRow[]; total: number }> {
    const single = filter.beneficiaryEmployeeId
      ? Prisma.sql`AND b.employee_id = ${filter.beneficiaryEmployeeId}::uuid`
      : Prisma.empty;
    const grouped = filter.beneficiaryEmployeeId
      ? Prisma.sql`AND l.employee_id = ${filter.beneficiaryEmployeeId}::uuid`
      : Prisma.empty;
    const waiting = Prisma.sql`
      SELECT r.id, r.type::text AS type, s.boundary_state::text AS boundary_state, r.plan_id, r.requester_employee_id,
             b.employee_id AS beneficiary_employee_id, r.expected_end_date, r.submitted_at, 1 AS line_count
        FROM access_requests r
        JOIN access_request_beneficiaries b ON b.request_id = r.id AND b.position = 1
        LEFT JOIN access_request_service_accounts s ON s.request_id = r.id
       WHERE r.state = 'AWAITING_EXECUTION' AND r.type IN ('GRANT', 'SERVICE_ACCOUNT') AND r.plan_id IS NOT NULL ${single}
      UNION ALL
      SELECT r.id, r.type::text AS type, NULL AS boundary_state, r.plan_id, r.requester_employee_id,
             l.employee_id AS beneficiary_employee_id, l.expected_end_date, r.submitted_at,
             (SELECT count(*)::int FROM access_request_beneficiaries n WHERE n.request_id = r.id) AS line_count
        FROM access_requests r
        JOIN access_request_lines l ON l.request_id = r.id AND l.state = 'APPROVED'
       WHERE r.type = 'GROUP_GRANT' AND r.state IN ('AWAITING_EXECUTION', 'EXECUTING') AND r.plan_id IS NOT NULL ${grouped}`;
    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<QueueRow[]>`
        SELECT * FROM (${waiting}) AS q
         ORDER BY q.beneficiary_employee_id, q.submitted_at, q.id
         LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM (${waiting}) AS q`,
    ]);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        type: row.type,
        boundaryState: row.boundary_state,
        planId: row.plan_id,
        requesterEmployeeId: row.requester_employee_id,
        beneficiaryEmployeeId: row.beneficiary_employee_id,
        expectedEndDate: row.expected_end_date ? fromDateColumn(row.expected_end_date) : null,
        submittedAt: row.submitted_at,
        lineCount: row.line_count,
      })),
      total: Number(counted[0]?.total ?? 0n),
    };
  }
}
