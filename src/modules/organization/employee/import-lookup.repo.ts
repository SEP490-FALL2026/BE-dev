import { Injectable } from '@nestjs/common';
import { BusinessDate, fromDateColumn } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { EmployeeImportLookupData } from '../public/organization.types';

/** Reads what a people file needs to be judged: the departments, people and emails it names. */
@Injectable()
export class ImportLookupRepo {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(
    client: DbTx | undefined,
    names: {
      departmentCodes: string[];
      employeeCodes: string[];
      normalizedEmails: string[];
    },
    today: BusinessDate,
  ): Promise<EmployeeImportLookupData> {
    const db = client ?? this.prisma;
    // One statement at a time on the client, in the order the people file names them: the departments, the people, the emails.
    const departments =
      names.departmentCodes.length === 0
        ? []
        : // Whether the department has a Cost Center is not asked: a department with none takes people in (`QĐ-87d(3)`).
          await db.$queryRaw<{ id: string; code: string; status: string; effective_from: string }[]>`
            SELECT d.id, d.code, d.status::text AS status, d.effective_from::text AS effective_from
              FROM departments d
             WHERE d.code = ANY(${names.departmentCodes}::text[])`;
    const employees =
      names.employeeCodes.length === 0
        ? []
        : await db.$queryRaw<
            {
              id: string;
              employee_code: string;
              full_name: string;
              work_email: string | null;
              employment_type: string;
              hire_date: Date;
              department_code: string | null;
              job_title_name: string | null;
            }[]
          >`
            SELECT e.id, e.employee_code, e.full_name, e.work_email, e.employment_type::text AS employment_type,
                   e.hire_date, d.code AS department_code, e.job_title AS job_title_name
              FROM employees e
              LEFT JOIN employee_placements p ON p.employee_id = e.id
                   AND p.valid_from <= ${today}::date AND (p.valid_to IS NULL OR p.valid_to > ${today}::date)
              LEFT JOIN departments d ON d.id = p.department_id
             WHERE e.employee_code = ANY(${names.employeeCodes}::text[])`;
    const emailOwners =
      names.normalizedEmails.length === 0
        ? []
        : await db.$queryRaw<{ normalized_work_email: string; employee_code: string }[]>`
            SELECT normalized_work_email, employee_code FROM employees
             WHERE normalized_work_email = ANY(${names.normalizedEmails}::text[])`;

    return {
      departments: departments.map((row) => ({
        id: row.id,
        code: row.code,
        // A department that takes effect after today takes nobody in (`QĐ-104e(3)`): it is told as one that does not take people.
        active: row.status === 'ACTIVE' && row.effective_from <= today,
      })),
      employees: employees.map((row) => ({
        id: row.id,
        employeeCode: row.employee_code,
        fullName: row.full_name,
        workEmail: row.work_email,
        employmentType: row.employment_type as 'STAFF' | 'CONTRACTOR' | 'FREELANCER' | 'INTERN',
        hireDate: fromDateColumn(row.hire_date),
        departmentCode: row.department_code,
        jobTitleName: row.job_title_name,
      })),
      emailOwners: emailOwners.map((row) => ({
        normalizedEmail: row.normalized_work_email,
        employeeCode: row.employee_code,
      })),
    };
  }

  /**
   * Takes the row locks the write needs: the departments, in id order, `FOR SHARE`: they must still exist and keep their
   * state until commit.
   */
  async lockForImport(tx: DbTx, departmentIds: string[]): Promise<void> {
    const sorted = (ids: string[]) => [...new Set(ids)].sort();
    if (departmentIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM departments WHERE id = ANY(${sorted(departmentIds)}::uuid[]) ORDER BY id FOR SHARE`;
    }
  }
}
