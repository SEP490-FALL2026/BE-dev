import { Injectable } from '@nestjs/common';
import { InvalidEmailError, normalizeEmail } from '../../../../core/email';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { EmployeeCells } from '../employee-import-row.types';
import type { StoredRow } from '../employee-import.repo';
import {
  EmployeeImportLookup,
  judgeEmployeeRows,
  lookupNamesOf,
  toEmployeeImportLookup,
} from './employee-import-row-validation.policy';

/** The record of the person importing: a row that names it is refused, however it compares (`US-02-02` AC-18). */
export type OwnRecord = { employeeCode: string; normalizedEmail: string | null } | null;

/**
 * Judges the rows of a people file against the organization as it is now (`US-02-02`, `US-02-03`): reads what the
 * organization says about the codes, emails and departments the rows name, and the record of the person importing, through
 * the organization facade only and in the transaction it is given. The rules themselves are pure, in
 * `employee-import-row-validation.policy.ts`. The preview judges with it; the confirmation judges again with it under its
 * locks.
 */
@Injectable()
export class EmployeeImportRowValidationService {
  constructor(private readonly organizationReads: OrganizationReadApi) {}

  async ownRecord(employeeId: string, tx?: DbTx): Promise<OwnRecord> {
    const own = await this.organizationReads.getEmployee(employeeId, tx);
    if (!own) return null;
    let normalizedEmail: string | null = null;
    if (own.workEmail) {
      try {
        normalizedEmail = normalizeEmail(own.workEmail);
      } catch (error) {
        if (!(error instanceof InvalidEmailError)) throw error;
      }
    }

    return { employeeCode: own.employeeCode, normalizedEmail };
  }

  async lookup(
    rows: readonly { cells: EmployeeCells }[],
    own: OwnRecord = null,
    tx?: DbTx,
  ): Promise<EmployeeImportLookup> {
    return {
      ...toEmployeeImportLookup(await this.organizationReads.lookupForEmployeeImport(lookupNamesOf(rows), tx)),
      own,
    };
  }

  /** Every row judged against the data as it is now, kept as the preview stores it. */
  async judge(rows: readonly { lineNumber: number; cells: EmployeeCells }[], own: OwnRecord): Promise<StoredRow[]> {
    return judgeEmployeeRows(rows, await this.lookup(rows, own)).map((row) => ({
      lineNumber: row.lineNumber,
      cells: row.cells,
      outcome: row.outcome,
      errors: row.errors,
      differences: row.differences ?? null,
    }));
  }

  /** The departments of these codes that nobody heads yet (`US-02-02` AC-1), as the summary and the result report them. */
  async departmentsWithoutHead(lookup: EmployeeImportLookup, departmentCodes: string[]) {
    const ids = departmentCodes.flatMap((code) => {
      const department = lookup.departments.get(code);

      return department ? [department.id] : [];
    });
    const without = await this.organizationReads.departmentsWithoutHead(ids);

    return without.map((department) => ({ code: department.code, name: department.name }));
  }
}
