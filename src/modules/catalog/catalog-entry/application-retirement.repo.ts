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
 * The writer of `application_retirement_confirmations` and of the retirement columns of `applications`. A confirmation is
 * written once and never changed; an application is retired once and never brought back (the database refuses both).
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

  async markRetired(
    tx: DbTx,
    applicationId: string,
    input: { appUserId: string; confirmationId: string; now: Date },
  ): Promise<void> {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        catalogStatus: 'RETIRED',
        retiredAt: input.now,
        retiredByAppUserId: input.appUserId,
        retirementConfirmationId: input.confirmationId,
      },
    });
  }
}
