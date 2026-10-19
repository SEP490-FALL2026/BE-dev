import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationModule } from '../organization/organization.module';
import { DataImportService } from './data-import.service';
import { EmployeeImportRepo } from './employee-import/employee-import.repo';
import { EmployeeImportService } from './employee-import/employee-import.service';
import { EmployeeImportsController } from './employee-import/employee-imports.controller';

/**
 * Importing files through the one framework of upload, preview and confirmation (`US-02-01`); the people file is the
 * first kind, in `employee-import/`. It writes people only through the facade of the `organization` module.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule],
  controllers: [EmployeeImportsController],
  providers: [EmployeeImportRepo, EmployeeImportService, DataImportService],
  // Other modules read imports through the facade only; the capability service and the repo stay private.
  exports: [DataImportService],
})
export class DataImportModule {}
