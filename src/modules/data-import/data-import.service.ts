import { Injectable } from '@nestjs/common';
import type { LatestEmployeeImport } from './data-import.types';
import { EmployeeImportService } from './employee-import/employee-import.service';

/**
 * The public contract of the data-import module: what other modules read about imports. Only the onboarding checklist
 * reads it today (US-02-04 AC-6); the import routes use their capability service directly.
 */
@Injectable()
export class DataImportService {
  constructor(private readonly employeeImports: EmployeeImportService) {}

  /** The latest people import that was not thrown away, or null before the first one: its status and wrong rows. */
  async latestEmployeeImport(): Promise<LatestEmployeeImport | null> {
    const latest = await this.employeeImports.latestImport();
    // A cancelled import is never the latest kept one (the read excludes it); the contract says so in its type.
    if (!latest || latest.status === 'CANCELLED') return null;

    return { id: latest.id, status: latest.status, errorRows: latest.errorRows };
  }
}
