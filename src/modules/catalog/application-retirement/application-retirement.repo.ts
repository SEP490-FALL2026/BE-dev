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

  /** The newest `take` confirmations of an application, and how many there are in all. */
  async confirmations(
    applicationId: string,
    take: number,
    tx?: DbTx,
  ): Promise<{ items: RetirementConfirmationRecord[]; total: number }> {
    const db = tx ?? this.prisma;
    const items = await db.applicationRetirementConfirmation.findMany({
      where: { applicationId },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take,
    });
    const total = await db.applicationRetirementConfirmation.count({ where: { applicationId } });

    return { items, total };
  }

  /**
   * The newest confirmation recorded by this employee as Business Owner, or null: the only one the decision reads. An application that
   * names no Business Owner (`QĐ-104`) has none.
   */
  async latestBy(
    applicationId: string,
    businessOwnerEmployeeId: string | null,
    tx?: DbTx,
  ): Promise<RetirementConfirmationRecord | null> {
    if (businessOwnerEmployeeId === null) return null;

    return (tx ?? this.prisma).applicationRetirementConfirmation.findFirst({
      where: { applicationId, businessOwnerEmployeeId },
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
