import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { LicensingModule } from '../licensing/licensing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { DataImportService } from './data-import.service';
import { EmployeeImportRepo } from './employee-import/employee-import.repo';
import { EmployeeImportService } from './employee-import/employee-import.service';
import { EmployeeImportsController } from './employee-import/employee-imports.controller';
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
    EmployeeImportService,
    SeatBaselineImportRepo,
    SeatBaselineImportService,
    DataImportService,
  ],
  // Other modules read imports through the facade only; the capability service and the repo stay private.
  exports: [DataImportService],
})
export class DataImportModule {}
