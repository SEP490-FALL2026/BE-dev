import { Module } from '@nestjs/common';
import { AccessRequestRepo } from './access-request/access-request.repo';
import { AssessmentReadRepo } from './access-request/assessment-read.repo';
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
import { BudgetsReadFacadeModule } from '../budgets/budgets-read-facade.module';
import { CatalogPricingFacadeModule } from '../catalog/catalog-pricing-facade.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';

/** The same routing and budget check in the API and worker; organizational listeners only mark conversions. */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    FinanceModule,
    BudgetsReadFacadeModule,
    CatalogPricingFacadeModule,
    OperatingParametersModule,
  ],
  providers: [
    AccessRequestRepo,
    AssessmentReadRepo,
    RoutingFactsService,
    StepTargetService,
    RepricingService,
    BudgetCheckRepo,
    BudgetCheckService,
    SpendStepRepo,
    SpendRoutingService,
  ],
  exports: [
    AccessRequestRepo,
    AssessmentReadRepo,
    RoutingFactsService,
    StepTargetService,
    RepricingService,
    BudgetCheckRepo,
    BudgetCheckService,
    SpendStepRepo,
    SpendRoutingService,
  ],
})
export class RequestsRoutingFacadeModule {}
