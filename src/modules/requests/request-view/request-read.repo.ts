import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/** How far a request went on its way to the money, as far as who reads it is concerned. Reads only. */
@Injectable()
export class RequestReadRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether a spend step was ever opened on the request, and whether its spend was approved (for the whole request, or for one
   * person of a request for a group). One statement.
   */
  async spendFactsOf(requestId: string): Promise<{ spendStepOpened: boolean; spendApproved: boolean }> {
    const [row] = await this.prisma.$queryRaw<{ opened: boolean; approved: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM access_request_steps WHERE request_id = ${requestId}::uuid AND kind = 'SPEND_APPROVAL') AS opened,
             (EXISTS (SELECT 1 FROM spend_decisions WHERE request_id = ${requestId}::uuid AND decision = 'APPROVED')
              OR EXISTS (SELECT 1 FROM access_request_line_decisions
                          WHERE request_id = ${requestId}::uuid AND stage = 'SPEND' AND decision = 'APPROVED')) AS approved`;

    return { spendStepOpened: row?.opened ?? false, spendApproved: row?.approved ?? false };
  }
}
