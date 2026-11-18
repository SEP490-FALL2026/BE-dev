import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * What of the personnel context refers to a person, so their first placement cannot be corrected (`QĐ-113e`): a transfer or a departure,
 * whatever its state. A read in the caller's transaction that no write goes through.
 */
@Injectable()
export class FirstPlacementPersonnelRepo {
  constructor(private readonly prisma: PrismaService) {}

  async referenceOf(employeeId: string, tx?: DbTx): Promise<'TRANSFER' | 'OFFBOARDING' | null> {
    const db = tx ?? this.prisma;
    if (await db.departmentTransfer.findFirst({ where: { employeeId }, select: { id: true } })) return 'TRANSFER';
    if (await db.offboardingCase.findFirst({ where: { employeeId }, select: { id: true } })) return 'OFFBOARDING';

    return null;
  }
}
