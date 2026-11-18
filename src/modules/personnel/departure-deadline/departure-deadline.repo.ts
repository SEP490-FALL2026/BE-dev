import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { RevocationStanding } from './departure-deadline.policy';

/** A departure that is still open and past the deadline of its revocations, before the rights left are counted. */
export interface LateCase {
  id: string;
  organizationId: string;
  employeeId: string;
  departmentId: string | null;
  state: Exclude<RevocationStanding['state'], 'CANCELLED'>;
  revocationDueOn: BusinessDate;
}

/**
 * The read of the departures whose deadline of revocation has passed (`QĐ-110c`): the cases that are not cancelled, not closed and have a
 * deadline before today. Whether a right is left to take away is not the table's to say (the seats are `licensing`'s), so the
 * caller counts them and keeps the cases that still have one. Reads only.
 */
@Injectable()
export class DepartureDeadlineRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** One page of them, by id after `afterId`; `departmentIds` narrows to the cases of those departments (and of people with none). */
  async pageLate(
    today: BusinessDate,
    page: { afterId: string | null; take: number; departmentIds?: readonly string[] | undefined },
  ): Promise<LateCase[]> {
    const rows = await this.prisma.offboardingCase.findMany({
      where: {
        state: { in: ['HANDING_OVER', 'LEFT'] },
        closedAt: null,
        revocationDueOn: { lt: toDateColumn(today) },
        ...(page.afterId ? { id: { gt: page.afterId } } : {}),
        ...(page.departmentIds
          ? { OR: [{ departmentId: { in: [...page.departmentIds] } }, { departmentId: null }] }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: page.take,
      select: {
        id: true,
        organizationId: true,
        employeeId: true,
        departmentId: true,
        state: true,
        revocationDueOn: true,
      },
    });

    // The filter above leaves out a case that is cancelled or has no deadline, so what is read is what the type says.
    return rows.map((row) => ({
      ...row,
      state: row.state as LateCase['state'],
      revocationDueOn: fromDateColumn(row.revocationDueOn as Date),
    }));
  }
}
