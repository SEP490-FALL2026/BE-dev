import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

/** The reads of the periods the renewal looks at, which no other repo of the subscription answers. */
@Injectable()
export class SubscriptionPeriodRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The ids of the terms of a `K2` plan that run a period (`SBF-20`: active, none that a later one continues), the shared pool's and a
   * department's alike, at most `limit`, by id.
   */
  async listAdjustmentSubjectIds(limit: number): Promise<string[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { kind: 'TERM', status: 'ACTIVE', renewedBy: null, plan: { provisioningType: 'K2' } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });

    return rows.map((row) => row.id);
  }
}
