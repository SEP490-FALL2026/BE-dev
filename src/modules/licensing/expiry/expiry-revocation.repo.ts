import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/** A right that ended and for which the system has not yet asked a revocation. */
export interface RightToAsk {
  assignmentId: string;
  expectedEndDate: BusinessDate;
}

interface RawRight {
  assignment_id: string;
  expected_end_date: string;
}

/**
 * The read of the pass that opens the revocation of the rights that ended (`QĐ-111l`): a read, not a table of its own. The key that keeps
 * the pass from asking twice is the reason of the task (`provisioning_task_reasons`: the source `TIME_LIMITED_EXPIRY` for the right), written
 * by the one gate that opens a revocation, so it holds for every instance, for the IT Admin who starts the task from the queue and for a task
 * that was closed meanwhile. Nothing is written here.
 */
@Injectable()
export class ExpiryRevocationRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The open personal rights whose end day is before `today` that the system has not asked a revocation for and that no revocation is
   * working on (another source's task, live, is already taking the seat away): a page after `afterId`, by id, so a pass reads them all
   * however many wait for a renewal and never starves the rest.
   */
  async rightsToAsk(today: BusinessDate, afterId: string | null, take: number): Promise<RightToAsk[]> {
    const rows = await this.prisma.$queryRaw<RawRight[]>`
      SELECT a.id AS assignment_id, to_char(a.expected_end_date, 'YYYY-MM-DD') AS expected_end_date
        FROM license_assignments a
       WHERE a.kind = 'PERSONAL' AND a.valid_until IS NULL AND a.failed_at IS NULL AND a.cancelled_at IS NULL
         AND a.expected_end_date < ${today}::date
         AND (${afterId}::uuid IS NULL OR a.id > ${afterId}::uuid)
         AND NOT EXISTS (SELECT 1 FROM provisioning_tasks t
                          JOIN provisioning_task_reasons r ON r.task_id = t.id
                         WHERE t.assignment_id = a.id AND t.kind = 'REVOKE' AND r.source = 'TIME_LIMITED_EXPIRY')
         AND NOT EXISTS (SELECT 1 FROM provisioning_tasks t
                          WHERE t.assignment_id = a.id AND t.kind = 'REVOKE' AND t.status NOT IN ('CLOSED_FAILED', 'CANCELLED'))
       ORDER BY a.id
       LIMIT ${take}`;

    return rows.map((row) => ({ assignmentId: row.assignment_id, expectedEndDate: row.expected_end_date }));
  }
}
