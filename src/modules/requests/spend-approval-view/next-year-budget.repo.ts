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
   * request the approver reads is compared with what the others hold, not with itself. A Cost Center with none is absent.
   */
  async keptByCostCenter(
    costCenterIds: readonly string[],
    year: number,
    exceptRequestIds: readonly string[],
  ): Promise<Map<string, bigint>> {
    if (costCenterIds.length === 0) return new Map();
    const groups = await this.prisma.accessRequest.groupBy({
      by: ['costCenterId'],
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
      _sum: { nextYearAmountMinor: true },
    });

    return new Map(
      groups.flatMap((group) =>
        group.costCenterId === null ? [] : [[group.costCenterId, group._sum.nextYearAmountMinor ?? 0n] as const],
      ),
    );
  }
}
