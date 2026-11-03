import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { unplacedEmployeeSql } from '../employee/employee.repo';
import {
  parseSearchTerm,
  VIETNAMESE_ACCENTED_CHARS,
  VIETNAMESE_UNACCENTED_CHARS,
} from './employee-directory-search.policy';
import {
  EMPLOYEE_PLACEMENT_HISTORY_LIMIT,
  type EmployeeDirectoryFilter,
  type EmployeeListRow,
  type EmployeePlacementHistoryRecord,
} from './employee-directory.types';

function buildListWhere(filter: EmployeeDirectoryFilter, today: BusinessDate): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (filter.departmentId !== undefined) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM employee_placements dp
       WHERE dp.employee_id = e.id
         AND dp.department_id = ${filter.departmentId}::uuid
         AND dp.valid_from <= ${today}::date
         AND (dp.valid_to IS NULL OR dp.valid_to > ${today}::date)
    )`);
  }

  if (filter.unplaced === true) {
    conditions.push(unplacedEmployeeSql('e.id'));
  } else if (filter.unplaced === false) {
    conditions.push(Prisma.sql`NOT (${unplacedEmployeeSql('e.id')})`);
  }

  if (filter.workState !== undefined) {
    conditions.push(Prisma.sql`e.work_state = ${filter.workState}::"EmployeeWorkState"`);
  }

  if (filter.employmentType !== undefined) {
    conditions.push(Prisma.sql`e.employment_type = ${filter.employmentType}::"EmploymentType"`);
  }

  if (filter.accountEmployeeIds !== undefined) {
    conditions.push(Prisma.sql`e.id = ANY(${[...filter.accountEmployeeIds]}::uuid[])`);
  }

  if (filter.excludeAccountEmployeeIds !== undefined) {
    conditions.push(Prisma.sql`NOT (e.id = ANY(${[...filter.excludeAccountEmployeeIds]}::uuid[]))`);
  }

  const search = parseSearchTerm(filter.q);
  if (search !== null) {
    if (search.exactId !== undefined) {
      conditions.push(Prisma.sql`e.id = ${search.exactId}::uuid`);
    } else {
      conditions.push(Prisma.sql`(
        upper(e.employee_code) LIKE ${search.codePattern} ESCAPE '\\'
        OR (e.normalized_work_email IS NOT NULL AND e.normalized_work_email LIKE ${search.emailPattern} ESCAPE '\\')
        OR lower(regexp_replace(translate(normalize(e.full_name, NFC), ${VIETNAMESE_ACCENTED_CHARS}, ${VIETNAMESE_UNACCENTED_CHARS}), '\\s+', ' ', 'g')) LIKE ${search.namePattern} ESCAPE '\\'
      )`);
    }
  }

  return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

async function fetchPlacementHistory(
  prisma: PrismaService,
  employeeId: string,
): Promise<EmployeePlacementHistoryRecord[]> {
  const placementRows = await prisma.$queryRaw<
    {
      department_id: string;
      department_code: string;
      department_name: string;
      valid_from: Date;
      valid_to: Date | null;
    }[]
  >`
    SELECT d.id AS department_id,
           d.code AS department_code,
           d.name AS department_name,
           p.valid_from,
           p.valid_to
      FROM employee_placements p
      JOIN departments d ON d.id = p.department_id
     WHERE p.employee_id = ${employeeId}::uuid
     ORDER BY p.valid_from DESC, p.id DESC
     LIMIT ${EMPLOYEE_PLACEMENT_HISTORY_LIMIT + 1}`;

  return placementRows.map((p) => ({
    department: {
      id: p.department_id,
      code: p.department_code,
      name: p.department_name,
    },
    validFrom: fromDateColumn(p.valid_from),
    validTo: p.valid_to ? fromDateColumn(p.valid_to) : null,
  }));
}

@Injectable()
export class EmployeeDirectoryRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads a page of employees and the total count inside a single RepeatableRead snapshot (API-LIST-DETAIL.1).
   */
  async listEmployees(
    filter: EmployeeDirectoryFilter,
    today: BusinessDate,
  ): Promise<{ items: EmployeeListRow[]; total: number }> {
    const whereClause = buildListWhere(filter, today);
    const skip = (filter.page - 1) * filter.pageSize;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<EmployeeListRow[]>`
          SELECT e.id,
                 e.employee_code,
                 e.full_name,
                 e.work_email,
                 e.employment_type,
                 e.status,
                 e.work_state,
                 e.hire_date,
                 e.job_title,
                 cur_p.department_id,
                 cur_p.department_code,
                 cur_p.department_name,
                 ${unplacedEmployeeSql('e.id')} AS unplaced
            FROM employees e
            LEFT JOIN LATERAL (
              SELECT d.id AS department_id, d.code AS department_code, d.name AS department_name
                FROM employee_placements p
                JOIN departments d ON d.id = p.department_id
               WHERE p.employee_id = e.id
                 AND p.valid_from <= ${today}::date
                 AND (p.valid_to IS NULL OR p.valid_to > ${today}::date)
               ORDER BY p.valid_from DESC
               LIMIT 1
            ) cur_p ON true
           ${whereClause}
           ORDER BY e.employee_code, e.id
           LIMIT ${filter.pageSize} OFFSET ${skip}`;

        const counted = await tx.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total
            FROM employees e
           ${whereClause}`;

        return {
          items: rows,
          total: counted[0]?.total ?? 0,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Reads the employee record, current placement and placement history for detail.
   */
  async findEmployeeDetail(
    employeeId: string,
    today: BusinessDate,
  ): Promise<{ employee: EmployeeListRow; rawPlacements: EmployeePlacementHistoryRecord[] } | null> {
    const employees = await this.prisma.$queryRaw<EmployeeListRow[]>`
      SELECT e.id,
             e.employee_code,
             e.full_name,
             e.work_email,
             e.employment_type,
             e.status,
             e.work_state,
             e.hire_date,
             e.job_title,
             cur_p.department_id,
             cur_p.department_code,
             cur_p.department_name,
             ${unplacedEmployeeSql('e.id')} AS unplaced
        FROM employees e
        LEFT JOIN LATERAL (
          SELECT d.id AS department_id, d.code AS department_code, d.name AS department_name
            FROM employee_placements p
            JOIN departments d ON d.id = p.department_id
           WHERE p.employee_id = e.id
             AND p.valid_from <= ${today}::date
             AND (p.valid_to IS NULL OR p.valid_to > ${today}::date)
           ORDER BY p.valid_from DESC
           LIMIT 1
        ) cur_p ON true
       WHERE e.id = ${employeeId}::uuid`;

    const employee = employees[0];
    if (!employee) return null;

    const rawPlacements = await fetchPlacementHistory(this.prisma, employeeId);
    return { employee, rawPlacements };
  }
}
