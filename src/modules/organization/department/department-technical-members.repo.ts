import { Injectable } from '@nestjs/common';
import { BusinessDate, fromDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { EmployeeTechnicalView, EmployeeWorkState } from '../public/organization.types';

/**
 * What an IT Admin may read of the people of a department they answer for (`F12`): the least a technical task needs. Read-only, and
 * kept apart from the other member reads so no column beyond these can be added to it by accident.
 */
@Injectable()
export class DepartmentTechnicalMembersRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The people placed in the department on `onDate`, in code order: one page and the total, read in one snapshot. Id, code, name,
   * work state and the first day of the placement; no email, kind of staff, hire date or anything else of the record.
   */
  async page(
    departmentId: string,
    onDate: BusinessDate,
    options: { skip: number; take: number },
  ): Promise<{ items: EmployeeTechnicalView[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string; employee_code: string; full_name: string; work_state: EmployeeWorkState; valid_from: Date }[]
        >`
          SELECT e.id, e.employee_code, e.full_name, e.work_state, p.valid_from
            FROM employee_placements p JOIN employees e ON e.id = p.employee_id
           WHERE p.department_id = ${departmentId}::uuid
             AND p.valid_from <= ${onDate}::date AND (p.valid_to IS NULL OR p.valid_to > ${onDate}::date)
           ORDER BY e.employee_code, e.id LIMIT ${options.take} OFFSET ${options.skip}`;
        const counted = await tx.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total FROM employee_placements p
           WHERE p.department_id = ${departmentId}::uuid
             AND p.valid_from <= ${onDate}::date AND (p.valid_to IS NULL OR p.valid_to > ${onDate}::date)`;

        return {
          items: rows.map((row) => ({
            id: row.id,
            code: row.employee_code,
            fullName: row.full_name,
            departmentId,
            employmentStatus: row.work_state,
            effectiveOn: fromDateColumn(row.valid_from),
          })),
          total: counted[0].total,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
