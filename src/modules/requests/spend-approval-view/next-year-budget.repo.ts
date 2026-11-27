import { Injectable } from '@nestjs/common';
import { DONG } from '../../../core/money/money';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { YEAR_START_REQUEST_STATES } from '../year-start-commitments/year-start-commitments.policy';

/**
 * What the approvals of the requests kept of a year for each Cost Center (`QĐ-111k`, `QĐ-111al`, R-15, R-46): the part of the year after of
 * a request approved as spend and not ended (one that was refused, withdrawn, failed or cancelled keeps nothing), summed in one statement
 * whatever the number of Cost Centers. It reads only; the numbers are written by the approval (`access_requests.next_year_amount_minor`).
 */
@Injectable()
export class NextYearBudgetRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The sum of the part of `year` that the requests of each Cost Center kept at their approval, those of `exceptRequestIds` left out: the
   * request the approver reads is compared with what the others hold, not with itself. Also returns the request ids whose kept amount
   * was counted so downstream `runningUncommitted` can exclude their already-accounted seats. A Cost Center with none is absent.
   */
  async keptByCostCenter(
    costCenterIds: readonly string[],
    year: number,
    exceptRequestIds: readonly string[],
  ): Promise<{ totals: Map<string, bigint>; requestIds: string[] }> {
    if (costCenterIds.length === 0) return { totals: new Map(), requestIds: [] };
    const rows = await this.prisma.accessRequest.findMany({
      where: {
        costCenterId: { in: [...new Set(costCenterIds)] },
        // The part of the year after is kept at the approval, for the year after the year it was approved in.
        budgetYear: year - 1,
        state: { in: [...YEAR_START_REQUEST_STATES] },
        nextYearAmountMinor: { not: null },
        // A part kept in another currency (an approval of before the prices were all in dong) is not added to dong, nor converted.
        amountCurrency: DONG,
        id: { notIn: [...exceptRequestIds] },
      },
      select: { id: true, costCenterId: true, nextYearAmountMinor: true },
    });

    const totals = new Map<string, bigint>();
    const requestIds: string[] = [];
    for (const row of rows) {
      if (row.costCenterId === null || row.nextYearAmountMinor === null) continue;
      totals.set(row.costCenterId, (totals.get(row.costCenterId) ?? 0n) + row.nextYearAmountMinor);
      if (row.nextYearAmountMinor > 0n) requestIds.push(row.id);
    }

    return { totals, requestIds };
  }
}
