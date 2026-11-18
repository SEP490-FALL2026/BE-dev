import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { HandingOverCase } from '../public/personnel.types';

/** What the facade reads of people about to leave (`getHandingOverCases`): the rules of wasted seats do not judge a seat in the middle of a handover. */
@Injectable()
export class PersonnelOverlapRepo {
  constructor(private readonly prisma: PrismaService) {}

  async handingOver(employeeIds: readonly string[]): Promise<HandingOverCase[]> {
    if (employeeIds.length === 0) return [];
    const rows = await this.prisma.offboardingCase.findMany({
      where: {
        employeeId: { in: [...employeeIds] },
        state: 'HANDING_OVER',
      },
      select: { employeeId: true, id: true, lastWorkingDay: true, handoverDueOn: true },
      orderBy: [{ lastWorkingDay: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      employeeId: row.employeeId,
      caseId: row.id,
      lastWorkingDay: fromDateColumn(row.lastWorkingDay),
      handoverDueOn: row.handoverDueOn ? fromDateColumn(row.handoverDueOn) : null,
    }));
  }
}
