import { Module } from '@nestjs/common';
import { DataImportModule } from '../data-import/data-import.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OrganizationModule } from '../organization/organization.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

/** The onboarding checklist. It owns no table: it only reads what the other modules offer. */
@Module({
  imports: [OrganizationModule, IdentityAccessFacadeModule, DataImportModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
