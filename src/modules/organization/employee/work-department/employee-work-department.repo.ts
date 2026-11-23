import { Injectable } from '@nestjs/common';
import { type BusinessDate } from '../../../../core/business-date';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../../infrastructure/database/transaction-runner';

/** Batch work-department queries (placement on `today`, falling back to latest placement begun by `today`). */
@Injectable()
export class EmployeeWorkDepartmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Work department on `today` for each employee in one query: active placement covering `today`, falling back to the
   * latest placement begun by `today`. Employees who have never been placed by `today` are absent from the map.
   */
  async workDepartmentsOf(
    employeeIds: readonly string[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, string>> {
    if (employeeIds.length === 0) return new Map();
    const uniqueIds = [...new Set(employeeIds)];
    const rows = await (tx ?? this.prisma).$queryRaw<{ employee_id: string; department_id: string }[]>`
      SELECT DISTINCT ON (p.employee_id) p.employee_id, p.department_id
        FROM employee_placements p
       WHERE p.employee_id = ANY(${uniqueIds}::uuid[])
         AND p.valid_from <= ${today}::date
       ORDER BY p.employee_id,
                (p.valid_to IS NULL OR p.valid_to > ${today}::date) DESC,
                p.valid_from DESC,
                p.id DESC`;

    return new Map(rows.map((row) => [row.employee_id, row.department_id]));
  }

  /**
   * Employees whose work department on `today` is in `departmentIds` (placed there on `today`, or having no placement on
   * `today` whose latest placement begun by `today` was in `departmentIds`), in one query.
   */
  async employeeIdsOfWorkDepartments(
    departmentIds: readonly string[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<string[]> {
    if (departmentIds.length === 0) return [];
    const uniqueIds = [...new Set(departmentIds)];
    const rows = await (tx ?? this.prisma).$queryRaw<{ employee_id: string }[]>`
      WITH latest_work_department AS (
        SELECT DISTINCT ON (p.employee_id) p.employee_id, p.department_id
          FROM employee_placements p
         WHERE p.valid_from <= ${today}::date
         ORDER BY p.employee_id,
                  (p.valid_to IS NULL OR p.valid_to > ${today}::date) DESC,
                  p.valid_from DESC,
                  p.id DESC
      )
      SELECT employee_id
        FROM latest_work_department
       WHERE department_id = ANY(${uniqueIds}::uuid[])
       ORDER BY employee_id`;

    return rows.map((row) => row.employee_id);
  }
}
