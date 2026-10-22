import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** What the Business Owner confirmed, who recorded it and when. */
export interface RetirementConfirmationRecord {
  id: string;
  applicationId: string;
  businessOwnerEmployeeId: string;
  note: string;
  recordedByAppUserId: string;
  recordedAt: Date;
}

export interface RetirementState {
  retiredAt: Date | null;
  retiredByAppUserId: string | null;
  retirementConfirmationId: string | null;
}

/**
 * The writer of `application_retirement_confirmations`, and a reader of the retirement columns of `applications` (which
 * `ApplicationRepo` writes). A confirmation is written once and never changed; the database refuses both a change and a
 * return of a retired application.
 */
@Injectable()
export class ApplicationRetirementRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertConfirmation(
    tx: DbTx,
    input: {
      organizationId: string;
      applicationId: string;
      businessOwnerEmployeeId: string;
      note: string;
      recordedByAppUserId: string;
    },
  ): Promise<RetirementConfirmationRecord> {
    return tx.applicationRetirementConfirmation.create({ data: input });
  }

  /** The confirmations of an application, the newest first. */
  async confirmations(applicationId: string, tx?: DbTx): Promise<RetirementConfirmationRecord[]> {
    return (tx ?? this.prisma).applicationRetirementConfirmation.findMany({
      where: { applicationId },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async stateOf(applicationId: string, tx?: DbTx): Promise<RetirementState | null> {
    return (tx ?? this.prisma).application.findUnique({
      where: { id: applicationId },
      select: { retiredAt: true, retiredByAppUserId: true, retirementConfirmationId: true },
    });
  }
}
