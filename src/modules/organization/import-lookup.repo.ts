import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../core/business-date';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { EmployeeImportLookupData } from './organization.types';

/** Reads what a people file needs to be judged: the departments, job titles, people and emails it names. */
@Injectable()
export class ImportLookupRepo {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(
    client: DbTx | undefined,
    names: {
      departmentCodes: string[];
      normalizedJobTitleNames: string[];
      employeeCodes: string[];
      normalizedEmails: string[];
    },
  ): Promise<EmployeeImportLookupData> {
    const db = client ?? this.prisma;
    const [departments, jobTitles, employees, emailOwners] = await Promise.all([
      names.departmentCodes.length === 0
        ? []
        : db.$queryRaw<{ id: string; code: string; status: string; cc_status: string }[]>`
            SELECT d.id, d.code, d.status::text AS status, c.status::text AS cc_status
              FROM departments d JOIN cost_centers c ON c.id = d.cost_center_id
             WHERE d.code = ANY(${names.departmentCodes}::text[])`,
      names.normalizedJobTitleNames.length === 0
        ? []
        : db.$queryRaw<{ id: string; name: string; normalized_name: string; status: string }[]>`
            SELECT id, name, normalized_name, status::text AS status FROM job_titles
             WHERE normalized_name = ANY(${names.normalizedJobTitleNames}::text[])`,
      names.employeeCodes.length === 0
        ? []
        : db.$queryRaw<
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
                   e.hire_date, d.code AS department_code, j.name AS job_title_name
              FROM employees e
              LEFT JOIN employee_placements p ON p.employee_id = e.id AND p.valid_to IS NULL
              LEFT JOIN departments d ON d.id = p.department_id
              LEFT JOIN job_titles j ON j.id = p.job_title_id
             WHERE e.employee_code = ANY(${names.employeeCodes}::text[])`,
      names.normalizedEmails.length === 0
        ? []
        : db.$queryRaw<{ normalized_work_email: string; employee_code: string }[]>`
            SELECT normalized_work_email, employee_code FROM employees
             WHERE normalized_work_email = ANY(${names.normalizedEmails}::text[])`,
    ]);

    return {
      departments: departments.map((row) => ({
        id: row.id,
        code: row.code,
        active: row.status === 'ACTIVE',
        costCenterActive: row.cc_status === 'ACTIVE',
      })),
      jobTitles: jobTitles.map((row) => ({
        id: row.id,
        name: row.name,
        normalizedName: row.normalized_name,
        status: row.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
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
   * Takes the row locks the write needs, in the order of the lock protocol: the departments, then the job titles,
   * each in id order, `FOR SHARE`: they must still exist and keep their state until commit.
   */
  async lockForImport(tx: DbTx, departmentIds: string[], jobTitleIds: string[]): Promise<void> {
    const sorted = (ids: string[]) => [...new Set(ids)].sort();
    if (departmentIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM departments WHERE id = ANY(${sorted(departmentIds)}::uuid[]) ORDER BY id FOR SHARE`;
    }
    if (jobTitleIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM job_titles WHERE id = ANY(${sorted(jobTitleIds)}::uuid[]) ORDER BY id FOR SHARE`;
    }
  }
}
