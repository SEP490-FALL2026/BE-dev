import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { LicensingModule } from '../licensing/licensing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { DataImportApi } from './public/data-import.api';
import { EmployeeImportConfirmationService } from './employee-import/confirmation/employee-import-confirmation.service';
import { EmployeeImportRepo } from './employee-import/employee-import.repo';
import { EmployeeImportsController } from './employee-import/employee-imports.controller';
import { EmployeeImportPreviewService } from './employee-import/preview/employee-import-preview.service';
import { EmployeeImportRowValidationService } from './employee-import/row-validation/employee-import-row-validation.service';
import { SeatBaselineImportRepo } from './seat-baseline-import/seat-baseline-import.repo';
import { SeatBaselineImportService } from './seat-baseline-import/seat-baseline-import.service';
import { SeatBaselineImportsController } from './seat-baseline-import/seat-baseline-imports.controller';

/**
 * Importing files through the one framework of upload, preview and confirmation (`US-02-01`); the people file is the
 * first kind, in `employee-import/`, and the seat baseline the second, in `seat-baseline-import/`. They write people
 * only through the facade of the `organization` module and assignments only through that of `licensing`.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule, LicensingModule, NotificationsModule],
  controllers: [EmployeeImportsController, SeatBaselineImportsController],
  providers: [
    EmployeeImportRepo,
    EmployeeImportRowValidationService,
    EmployeeImportPreviewService,
    EmployeeImportConfirmationService,
    SeatBaselineImportRepo,
    SeatBaselineImportService,
    DataImportApi,
  ],
  // Other modules read imports through the facade only; the capability services and the repos stay private.
  exports: [DataImportApi],
})
export class DataImportModule {}
