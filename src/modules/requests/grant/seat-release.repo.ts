import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { coverageEndOf, type SeatCoverage } from './seat-release.policy';

/**
 * Reads which requests hold money for a right and the months each covers (`RV-07`, `M-10`): the request whose grant made it and every request
 * to go on using that names one of the records of its chain, as the one it renews or the one that follows. Nothing here writes.
 */
@Injectable()
export class SeatReleaseRepo {
  /**
   * The months each request covers, by request id: the requests named, and those to go on using whose record renewed or follows one of
   * `assignmentIds`. A request to go on using covers to its new end. A request with months of use records no end date, so the request whose
   * grant made the right (`grant`) covers to the end of the seat that grant made.
   */
  async coverageOf(
    tx: DbTx,
    input: {
      requestIds: readonly string[];
      assignmentIds: readonly string[];
      grant?: { requestId: string | null; endDate: BusinessDate | null };
    },
  ): Promise<Map<string, SeatCoverage>> {
    if (input.requestIds.length === 0 && input.assignmentIds.length === 0) return new Map();
    const rows = await tx.$queryRaw<
      {
        id: string;
        budget_year: number | null;
        amount_months: number | null;
        term_months: number | null;
        end_date: Date | null;
      }[]
    >`
      SELECT r."id"::text AS id, r."budget_year" AS budget_year, r."amount_months" AS amount_months, r."term_months" AS term_months,
             COALESCE(rn."new_expected_end_date", r."expected_end_date") AS end_date
        FROM "access_requests" r
        LEFT JOIN "access_request_renewals" rn ON rn."request_id" = r."id"
       WHERE r."id" = ANY(${[...input.requestIds]}::uuid[])
          OR rn."assignment_id" = ANY(${[...input.assignmentIds]}::uuid[])
          OR rn."successor_assignment_id" = ANY(${[...input.assignmentIds]}::uuid[])
       ORDER BY r."id"`;

    return new Map(
      rows.map((row) => [
        row.id,
        {
          endDate: coverageEndOf({
            recordedEnd: row.end_date === null ? null : fromDateColumn(row.end_date),
            termMonths: row.term_months,
            grantedEnd: row.id === input.grant?.requestId ? input.grant.endDate : null,
          }),
          budgetYear: row.budget_year,
          amountMonths: row.amount_months,
        },
      ]),
    );
  }
}
