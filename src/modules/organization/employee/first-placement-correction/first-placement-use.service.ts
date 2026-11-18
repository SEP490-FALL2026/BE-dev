import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { DepartmentRecordService } from '../../department/department-record.service';
import { FirstPlacementUseContributions } from '../../public/organization.extension-points';
import { FirstPlacementUseReaderMissingError } from '../employee.errors';
import type { FirstPlacementUse } from '../../public/organization-use.types';

/** The contributors that must be registered: an absent one would read as "unused" (fail closed). */
const EXPECTED_READERS = ['requests.requests-of-person', 'personnel.transfers-and-departures'] as const;

/**
 * What refers to the first placement of a person, so it can no longer be corrected (`QĐ-113e`): their own head periods, and what the modules
 * that hold the facts tell (Requests, transfers, departures). Asked in the caller's transaction, with the employee locked. Only the API runs
 * the correction, and it loads every one of those modules.
 */
@Injectable()
export class FirstPlacementUseService {
  constructor(
    private readonly departments: DepartmentRecordService,
    private readonly readers: FirstPlacementUseContributions,
  ) {}

  /** Throws FirstPlacementUseReaderMissingError when an expected contributor is not registered. */
  async read(tx: DbTx, employeeId: string): Promise<FirstPlacementUse | null> {
    const registered = this.readers.names();
    const missing = EXPECTED_READERS.find((name) => !registered.includes(name));
    if (missing) throw new FirstPlacementUseReaderMissingError(missing);
    if ((await this.departments.headPeriodsOf(employeeId, '1900-01-01', tx)).length > 0) return 'HEAD_PERIOD';
    for (const reader of this.readers.all()) {
      const found = await reader.read(employeeId, tx);
      if (found) return found;
    }

    return null;
  }
}
