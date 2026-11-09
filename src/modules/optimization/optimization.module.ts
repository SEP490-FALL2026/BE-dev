import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { LicensingModule } from '../licensing/licensing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { GhostSeatRepo } from './ghost-seat/ghost-seat.repo';
import { GhostSeatService } from './ghost-seat/ghost-seat.service';
import { InternalRulesG1Service } from './internal-rules/internal-rules-g1.service';
import { InternalRulesSweeper } from './internal-rules/internal-rules.job';
import { InternalRulesService } from './internal-rules/internal-rules.service';
import { RuleRunRepo } from './rule-run/rule-run.repo';
import { RuleRunService } from './rule-run/rule-run.service';

/**
 * The recommendations of wasted seats (`G1`, `G2`; `FR-4.9` gates 1 and 8, `FR-4.12`): the runs that make them every day, the table of
 * the IT Admin that shows them, the reclaim of a `G2` through the revocation of licensing, and `KPI-5`. It reads the facades of
 * licensing, catalog, organization, the operating parameters and notifications; nothing changes a seat by itself (`SoD-6`).
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    OperatingParametersModule,
    CatalogModule,
    LicensingModule,
    NotificationsModule,
  ],
  providers: [
    GhostSeatRepo,
    GhostSeatService,
    RuleRunRepo,
    RuleRunService,
    InternalRulesG1Service,
    InternalRulesService,
    InternalRulesSweeper,
  ],
})
export class OptimizationModule {}
