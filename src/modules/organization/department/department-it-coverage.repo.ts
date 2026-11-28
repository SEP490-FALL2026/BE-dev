import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { EmployeeStatus } from '../public/organization.types';

/** Read-only queries of active department IT Admin substitutes needed by `DepartmentRecordService` without importing L3 capabilities. */
@Injectable()
export class DepartmentItCoverageRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Active temporary substitutes across all departments (at most one per department). */
  async activeItSubstitutes(
    tx?: DbTx,
  ): Promise<{ departmentId: string; substituteEmployeeId: string; substituteStatus: EmployeeStatus }[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<
      { department_id: string; substitute_employee_id: string; substitute_status: EmployeeStatus }[]
    >`
      SELECT s.department_id, s.substitute_employee_id, e.status AS substitute_status
        FROM department_it_substitutes s
        JOIN employees e ON e.id = s.substitute_employee_id
       WHERE s.ended_at IS NULL`;

    return rows.map((row) => ({
      departmentId: row.department_id,
      substituteEmployeeId: row.substitute_employee_id,
      substituteStatus: row.substitute_status,
    }));
  }

  /** Active temporary substitutes for the given departments, in one batch query. */
  async activeItSubstitutesFor(
    departmentIds: readonly string[],
    tx?: DbTx,
  ): Promise<{ departmentId: string; substituteEmployeeId: string; substituteStatus: EmployeeStatus }[]> {
    if (departmentIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).$queryRaw<
      { department_id: string; substitute_employee_id: string; substitute_status: EmployeeStatus }[]
    >`
      SELECT s.department_id, s.substitute_employee_id, e.status AS substitute_status
        FROM department_it_substitutes s
        JOIN employees e ON e.id = s.substitute_employee_id
       WHERE s.ended_at IS NULL AND s.department_id = ANY(${[...departmentIds]}::uuid[])`;

    return rows.map((row) => ({
      departmentId: row.department_id,
      substituteEmployeeId: row.substitute_employee_id,
      substituteStatus: row.substitute_status,
    }));
  }
}
