import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface RetirementState {
  retiredAt: Date | null;
  retiredByAppUserId: string | null;
  retirementConfirmationId: string | null;
}

/**
 * A reader of the retirement columns of `applications` (which `ApplicationRepo` writes). Nobody confirms a retirement any more (`QĐ-111g`):
 * the confirmations that were kept stay in their table, unread.
 */
@Injectable()
export class ApplicationRetirementRepo {
  constructor(private readonly prisma: PrismaService) {}

  async stateOf(applicationId: string, tx?: DbTx): Promise<RetirementState | null> {
    return (tx ?? this.prisma).application.findUnique({
      where: { id: applicationId },
      select: { retiredAt: true, retiredByAppUserId: true, retirementConfirmationId: true },
    });
  }
}
