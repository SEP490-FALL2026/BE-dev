import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** A right whose renewal window is due to open: personal, open, ending within the window, with nothing following it yet. */
export interface WindowCandidate {
  assignmentId: string;
  organizationId: string;
  employeeId: string;
  planId: string;
  expectedEndDate: BusinessDate;
}

interface RawCandidate {
  assignment_id: string;
  organization_id: string;
  employee_id: string;
  plan_id: string;
  expected_end_date: string;
}

/**
 * The one writer of `assignment_renewal_windows` (`BR-MF1-08a`, `QĐ-108b`): the window of the renewal of a right, recorded once when it
 * opens with the number of days in force then. A row is never changed or deleted (trigger); writing it again does nothing.
 */
@Injectable()
export class ExpiryRenewalWindowRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The rights whose window has opened by `today` (their end is at most `windowDays` days away and not passed) and is not recorded yet:
   * personal (a service account has no renewal), open, with no record following them. Oldest end first, at most `take`.
   */
  async candidates(today: BusinessDate, windowDays: number, take: number): Promise<WindowCandidate[]> {
    const rows = await this.prisma.$queryRaw<RawCandidate[]>`
      SELECT a.id AS assignment_id, a.organization_id, a.employee_id, a.plan_id,
             to_char(a.expected_end_date, 'YYYY-MM-DD') AS expected_end_date
        FROM license_assignments a
       WHERE a.kind = 'PERSONAL' AND a.valid_until IS NULL AND a.failed_at IS NULL AND a.cancelled_at IS NULL
         AND a.expected_end_date BETWEEN ${today}::date AND (${today}::date + ${windowDays}::int)
         AND NOT EXISTS (SELECT 1 FROM license_assignments s WHERE s.predecessor_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM assignment_renewal_windows w
                          WHERE w.assignment_id = a.id AND w.expected_end_date = a.expected_end_date)
       ORDER BY a.expected_end_date, a.id
       LIMIT ${take}`;

    return rows.map((row) => ({
      assignmentId: row.assignment_id,
      organizationId: row.organization_id,
      employeeId: row.employee_id,
      planId: row.plan_id,
      expectedEndDate: row.expected_end_date,
    }));
  }

  /** Records the window; false when it was recorded already (by another pass a moment before). */
  async insert(
    tx: DbTx,
    input: { candidate: WindowCandidate; windowDays: number; opensOn: BusinessDate },
  ): Promise<boolean> {
    const written = await tx.assignmentRenewalWindow.createMany({
      data: [
        {
          assignmentId: input.candidate.assignmentId,
          expectedEndDate: toDateColumn(input.candidate.expectedEndDate),
          organizationId: input.candidate.organizationId,
          windowDays: input.windowDays,
          opensOn: toDateColumn(input.opensOn),
        },
      ],
      skipDuplicates: true,
    });

    return written.count === 1;
  }

  async find(
    assignmentId: string,
    expectedEndDate: BusinessDate,
    tx?: DbTx,
  ): Promise<{ windowDays: number; opensOn: BusinessDate } | null> {
    const row = await (tx ?? this.prisma).assignmentRenewalWindow.findUnique({
      where: { assignmentId_expectedEndDate: { assignmentId, expectedEndDate: toDateColumn(expectedEndDate) } },
      select: { windowDays: true, opensOn: true },
    });

    return row ? { windowDays: row.windowDays, opensOn: fromDateColumn(row.opensOn) } : null;
  }
}
