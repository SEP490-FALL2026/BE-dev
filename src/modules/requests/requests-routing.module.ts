import { PendingSpendListener } from './spend/pending-spend.listener';
import { Module } from '@nestjs/common';
import { AccessRequestRepo } from './access-request/access-request.repo';
import { AssessmentReadRepo } from './access-request/assessment-read.repo';
import { RequestFactsService } from './access-request/request-facts.service';
import { RoutingFactsService } from './access-request/routing-facts.service';
import { StepTargetService } from './step-routing/step-target.service';
import { RepricingService } from './repricing/repricing.service';
import { BudgetCheckRepo } from './spend/budget-check.repo';
import { BudgetCheckService } from './spend/budget-check.service';
import { SpendStepRepo } from './spend/spend-step.repo';
import { SpendRoutingService } from './spend/spend-routing.service';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationModule } from '../organization/organization.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { FinanceModule } from '../finance/finance.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CatalogModule } from '../catalog/catalog.module';
import { LicensingModule } from '../licensing/licensing.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';

/** The same routing and budget check in the API and worker; organizational listeners only mark conversions. */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule, IdentityAccessFacadeModule, FinanceModule, BudgetsModule, CatalogModule, LicensingModule, OperatingParametersModule],
  providers: [PendingSpendListener, AccessRequestRepo, AssessmentReadRepo, RequestFactsService, RoutingFactsService, StepTargetService, RepricingService, BudgetCheckRepo, BudgetCheckService, SpendStepRepo, SpendRoutingService],
  exports: [AccessRequestRepo, AssessmentReadRepo, RequestFactsService, RoutingFactsService, StepTargetService, RepricingService, BudgetCheckRepo, BudgetCheckService, SpendStepRepo, SpendRoutingService],
})
export class RequestsRoutingModule {}
