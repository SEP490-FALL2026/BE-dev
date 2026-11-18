import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** The one writer of `request_supplement_drops` (`US-06-14` AC-13): the people a supplementary file left out, never changed. */
@Injectable()
export class SupplementDropRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(tx: DbTx, requestId: string, number: number, employeeIds: readonly string[]): Promise<void> {
    if (employeeIds.length === 0) return;
    await tx.requestSupplementDrop.createMany({
      data: employeeIds.map((employeeId) => ({ requestId, number, employeeId })),
    });
  }

  /** The people each file of the request left out, by number of the file. */
  async of(requestId: string, numbers: readonly number[]): Promise<Map<number, string[]>> {
    const rows = await this.prisma.requestSupplementDrop.findMany({
      where: { requestId, number: { in: [...numbers] } },
      orderBy: [{ number: 'asc' }, { employeeId: 'asc' }],
    });
    const found = new Map<number, string[]>();
    for (const row of rows) found.set(row.number, [...(found.get(row.number) ?? []), row.employeeId]);

    return found;
  }
}
