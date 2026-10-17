import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationModule } from '../organization/organization.module';
import { EmployeeImportRepo } from './employee-import.repo';
import { EmployeeImportService } from './employee-import.service';
import { EmployeeImportsController } from './employee-imports.controller';

/**
 * Importing files through the one framework of upload, preview and confirmation (`US-02-01`); the people file is the
 * first kind. It writes people only through the facade of the `organization` module.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule],
  controllers: [EmployeeImportsController],
  providers: [EmployeeImportRepo, EmployeeImportService],
  // The service is read by the onboarding checklist; the repo stays private.
  exports: [EmployeeImportService],
})
export class DataImportModule {}
