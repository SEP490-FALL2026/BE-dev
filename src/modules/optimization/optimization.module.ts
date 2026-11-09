import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { CatalogModule } from '../catalog/catalog.module';
import { LicensingModule } from '../licensing/licensing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { PersonnelModule } from '../personnel/personnel.module';
import { UsageModule } from '../usage/usage.module';
import { BoardController } from './board/board.controller';
import { BoardKpiService } from './board/board-kpi.service';
import { BoardQueryService } from './board/board-query.service';
import { BoardReclaimService } from './board/board-reclaim.service';
import { BoardSummaryService } from './board/board-summary.service';
import { DecisionController } from './decision/decision.controller';
import { DecisionQueueService } from './decision/decision-queue.service';
import { DecisionReminderService } from './decision/decision-reminder.service';
import { DecisionReclaimService } from './decision/decision-reclaim.service';
import { DecisionReturnService } from './decision/decision-return.service';
import { DecisionService } from './decision/decision.service';
import { DecisionFollowUpService } from './decision/decision-follow-up.service';
import { DecisionFollowUpSweeper } from './decision/decision-follow-up.job';
import { DecisionRoutingService } from './decision/decision-routing.service';
import { DecisionTransferService } from './decision/decision-transfer.service';
import { GhostSeatDecisionRepo } from './ghost-seat/ghost-seat-decision.repo';
import { GhostSeatRepo } from './ghost-seat/ghost-seat.repo';
import { GhostSeatRevocationListener } from './ghost-seat/ghost-seat-revocation.listener';
import { GhostSeatService } from './ghost-seat/ghost-seat.service';
import { InternalRulesG1Service } from './internal-rules/internal-rules-g1.service';
import { InternalRulesG2Service } from './internal-rules/internal-rules-g2.service';
import { InternalRulesSweeper } from './internal-rules/internal-rules.job';
import { InternalRulesService } from './internal-rules/internal-rules.service';
import { OptimizationApi } from './public/optimization.api';
import { RuleRunQueryService } from './rule-run/rule-run-query.service';
import { RuleRunRepo } from './rule-run/rule-run.repo';
import { RuleRunService } from './rule-run/rule-run.service';
import { UsageImportListener } from './usage-rules/usage-import.listener';
import { UsageNegationService } from './usage-rules/usage-negation.service';
import { UsageRulesSweeper } from './usage-rules/usage-rules.job';
import { UsageRulesRepo } from './usage-rules/usage-rules.repo';
import { UsageRulesContextService } from './usage-rules/usage-rules-context.service';
import { UsageRulesSeatService } from './usage-rules/usage-rules-seat.service';
import { UsageStaleNoticeService } from './usage-rules/usage-stale-notice.service';
import { UsageRulesService } from './usage-rules/usage-rules.service';

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
    IdentityAccessFacadeModule,
    PersonnelModule,
    UsageModule,
  ],
  controllers: [BoardController, DecisionController],
  providers: [
    BoardQueryService,
    BoardSummaryService,
    BoardReclaimService,
    BoardKpiService,
    OptimizationApi,
    RuleRunQueryService,
    GhostSeatRepo,
    GhostSeatService,
    GhostSeatRevocationListener,
    RuleRunRepo,
    RuleRunService,
    InternalRulesG1Service,
    InternalRulesG2Service,
    InternalRulesService,
    InternalRulesSweeper,
    DecisionRoutingService,
    DecisionTransferService,
    DecisionFollowUpService,
    DecisionFollowUpSweeper,
    DecisionQueueService,
    DecisionReclaimService,
    DecisionService,
    DecisionReturnService,
    DecisionReminderService,
    GhostSeatDecisionRepo,
    UsageRulesRepo,
    UsageNegationService,
    UsageRulesContextService,
    UsageStaleNoticeService,
    UsageRulesSeatService,
    UsageRulesService,
    UsageRulesSweeper,
    UsageImportListener,
  ],
  exports: [OptimizationApi],
})
export class OptimizationModule {}
