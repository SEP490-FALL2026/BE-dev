import { Injectable } from '@nestjs/common';
import { addDays, fromDateColumn, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { coverageEndOf, lastMonthBeginsOf, type SeatCoverage } from './seat-release.policy';

interface CoverageQueryRow {
  id: string;
  request_type: string;
  budget_year: number | null;
  amount_months: number | null;
  term_months: number | null;
  end_date: Date | null;
  previous_end: Date | null;
  by_hand: boolean;
}

function toCoverageEntry(
  row: CoverageQueryRow,
  grant?: { requestId: string | null; startDate: BusinessDate | null; endDate: BusinessDate | null },
): [string, SeatCoverage] {
  const granted = row.id === grant?.requestId ? grant : undefined;
  const recordedEnd = row.end_date === null ? null : fromDateColumn(row.end_date);
  // Group grants can give each beneficiary their own contract-cut end date on the granted assignment while the request carries none.
  const endDate =
    row.request_type === 'GROUP_GRANT' && recordedEnd === null
      ? (granted?.endDate ?? null)
      : coverageEndOf({
          recordedEnd,
          termMonths: row.term_months,
          grantedEnd: granted?.endDate ?? null,
        });
  // The months of a request with months of use begin on the days of its term: from the start of the seat its grant made, or from the day after the
  // end of the right a request to go on using renews.
  const startDate =
    granted !== undefined
      ? granted.startDate
      : row.previous_end === null
        ? null
        : addDays(fromDateColumn(row.previous_end), 1);

  return [
    row.id,
    {
      endDate,
      lastMonthBeginsOn: lastMonthBeginsOf({
        startDate,
        endDate,
        termMonths: row.term_months,
        byHand: row.by_hand,
      }),
      budgetYear: row.budget_year,
      amountMonths: row.amount_months,
    },
  ];
}

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
      grant?: { requestId: string | null; startDate: BusinessDate | null; endDate: BusinessDate | null };
    },
  ): Promise<Map<string, SeatCoverage>> {
    if (input.requestIds.length === 0 && input.assignmentIds.length === 0) return new Map();
    const rows = await tx.$queryRaw<CoverageQueryRow[]>`
      SELECT r."id"::text AS id, r."type"::text AS request_type, r."budget_year" AS budget_year, r."amount_months" AS amount_months, r."term_months" AS term_months,
             COALESCE(rn."new_expected_end_date", r."expected_end_date") AS end_date, rn."previous_expected_end_date" AS previous_end,
             (r."expected_end_date" IS NOT NULL AND rn."request_id" IS NULL) AS by_hand
        FROM "access_requests" r
        LEFT JOIN "access_request_renewals" rn ON rn."request_id" = r."id"
       WHERE r."id" = ANY(${[...input.requestIds]}::uuid[])
          OR rn."assignment_id" = ANY(${[...input.assignmentIds]}::uuid[])
          OR rn."successor_assignment_id" = ANY(${[...input.assignmentIds]}::uuid[])
       ORDER BY r."id"`;

    return new Map(rows.map((row) => toCoverageEntry(row, input.grant)));
  }

  /** Confirmed budget invoice ids grouped by `requestId`, for K1 annual F8 transfer offsets. */
  async confirmedInvoiceIdsByRequests(tx: DbTx, requestIds: readonly string[]): Promise<Map<string, string[]>> {
    if (requestIds.length === 0) return new Map();
    const rows = await tx.purchaseInvoice.findMany({
      where: {
        requestId: { in: [...new Set(requestIds)] },
        state: 'CONFIRMED',
        invoiceId: { not: null },
      },
      select: { requestId: true, invoiceId: true },
      orderBy: [{ serviceMonth: 'asc' }, { decidedAt: 'asc' }, { id: 'asc' }],
    });
    const byRequest = new Map<string, string[]>();
    for (const row of rows) {
      if (row.requestId === null || row.invoiceId === null) continue;
      const list = byRequest.get(row.requestId) ?? [];
      list.push(row.invoiceId);
      byRequest.set(row.requestId, list);
    }

    return byRequest;
  }

  /** Cost center ids of requests (`access_requests.cost_center_id`), keyed by request id. */
  async requestCostCenters(tx: DbTx, requestIds: readonly string[]): Promise<Map<string, string | null>> {
    if (requestIds.length === 0) return new Map();
    const rows = await tx.accessRequest.findMany({
      where: { id: { in: [...new Set(requestIds)] } },
      select: { id: true, costCenterId: true },
    });

    return new Map(rows.map((row) => [row.id, row.costCenterId]));
  }
}
