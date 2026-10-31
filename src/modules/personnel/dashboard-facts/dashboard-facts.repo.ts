import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/**
 * The counts the role overviews read of personnel (`US-12-15` AC-3, AC-4, AC-7), which no write goes through: one statement each, the
 * same filter as the list that shows the rows. Only counts leave, never a person, a reason or a document.
 */
@Injectable()
export class PersonnelDashboardFactsRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The reviews of tools after a transfer into the department that are still open (the head of the department decides them). */
  openTransferReviews(departmentId: string): Promise<number> {
    return this.prisma.transferReview.count({ where: { departmentId, status: 'OPEN' } });
  }

  /** The departures of people of these departments that are still handing over. */
  handingOverCases(departmentIds: readonly string[]): Promise<number> {
    if (departmentIds.length === 0) return Promise.resolve(0);

    return this.prisma.offboardingCase.count({
      where: { departmentId: { in: [...departmentIds] }, state: 'HANDING_OVER' },
    });
  }

  /** The notices of heads that wait to be rejected or recorded. */
  noticesAwaitingHandling(): Promise<number> {
    return this.prisma.personnelNotice.count({ where: { status: 'PENDING_VERIFICATION' } });
  }
}
