import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/** One assessment that has been decided, as the list reads it: what it is, who asked, how it ended and who ended it. */
export interface AssessmentDecisionRow {
  requestId: string;
  softwareName: string;
  requesterEmployeeId: string;
  departmentId: string;
  /** The proposal names an application of the catalog: only the plan was assessed (`QĐ-111a`). */
  planOnly: boolean;
  result: 'COMPLETED' | 'REJECTED';
  rejectionKind: 'UNCONTROLLABLE' | 'NOT_ELIGIBLE' | null;
  reason: string | null;
  decidedByEmployeeId: string;
  decidedAt: Date;
}

interface RawRow {
  request_id: string;
  software_name: string;
  requester_employee_id: string;
  department_id: string;
  plan_only: boolean;
  status: 'COMPLETED' | 'REJECTED';
  rejection_kind: 'UNCONTROLLABLE' | 'NOT_ELIGIBLE' | null;
  rejection_reason: string | null;
  decided_by_employee_id: string;
  decided_at: Date;
}

/**
 * The proposals whose assessment the IT Admin has decided, newest decision first. It only reads: an assessment is completed or refused by the routes
 * of the request. A completed assessment has no rejection columns and a refused one has no completion columns (a CHECK), so the day and the person of
 * the decision are the ones that are present.
 */
@Injectable()
export class AssessmentDecisionsRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the decided assessments of the scope, and the total for the same filter, from one snapshot so a decision made meanwhile cannot
   * make the total disagree with the page. `request_id` breaks ties between decisions of the same instant.
   */
  async page(
    departmentIds: readonly string[],
    skip: number,
    take: number,
  ): Promise<{ rows: AssessmentDecisionRow[]; total: number }> {
    const ids = [...departmentIds];
    const { raw, total } = await this.prisma.$transaction(
      async (tx) => ({
        raw: await tx.$queryRaw<RawRow[]>`
          SELECT a.request_id, p.software_name, r.requester_employee_id, r.department_id,
                 (p.existing_application_id IS NOT NULL) AS plan_only,
                 a.status::text AS status, a.rejection_kind::text AS rejection_kind, a.rejection_reason,
                 COALESCE(a.completed_by_employee_id, a.rejected_by_employee_id) AS decided_by_employee_id,
                 COALESCE(a.completed_at, a.rejected_at) AS decided_at
            FROM access_request_assessments a
            JOIN access_requests r ON r.id = a.request_id
            JOIN access_request_proposals p ON p.request_id = a.request_id
           WHERE a.status IN ('COMPLETED', 'REJECTED') AND r.department_id = ANY(${ids}::uuid[])
           ORDER BY COALESCE(a.completed_at, a.rejected_at) DESC, a.request_id ASC
           LIMIT ${take} OFFSET ${skip}`,
        total: await tx.accessRequestAssessment.count({
          where: { status: { in: ['COMPLETED', 'REJECTED'] }, request: { departmentId: { in: ids } } },
        }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      rows: raw.map((row) => ({
        requestId: row.request_id,
        softwareName: row.software_name,
        requesterEmployeeId: row.requester_employee_id,
        departmentId: row.department_id,
        planOnly: row.plan_only,
        result: row.status,
        rejectionKind: row.rejection_kind,
        reason: row.rejection_reason,
        decidedByEmployeeId: row.decided_by_employee_id,
        decidedAt: row.decided_at,
      })),
      total,
    };
  }
}
