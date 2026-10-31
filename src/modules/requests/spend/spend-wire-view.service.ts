import { Injectable } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';

export interface MoneyWire {
  amount: string;
  currency: string;
}

export interface EmployeeWire {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

/** How the people and the money of the spend capability are written for a reader: one read of each, never one per row. */
@Injectable()
export class SpendWireViewService {
  constructor(
    private readonly finance: FinanceApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async formatter(currency: string): Promise<(minor: bigint) => MoneyWire> {
    const units = (await this.finance.findCurrency(currency))?.minorUnit ?? 2;

    return (minor) => ({ amount: formatAmount(minor, units), currency });
  }

  /** The minor digits of each of the currencies, read once. */
  async units(currencies: readonly (string | null)[]): Promise<Map<string, number>> {
    const units = new Map<string, number>();
    for (const code of new Set(currencies)) {
      if (code !== null) units.set(code, (await this.finance.findCurrency(code))?.minorUnit ?? 2);
    }

    return units;
  }

  async people(ids: readonly (string | null)[]): Promise<Map<string, EmployeeWire>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    const found = wanted.length === 0 ? [] : await this.organizationReads.getEmployees(wanted);

    return new Map(
      found.map((employee) => [
        employee.id,
        { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
      ]),
    );
  }
}
