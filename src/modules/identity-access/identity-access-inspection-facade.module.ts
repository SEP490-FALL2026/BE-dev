import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';
import { IdentityAccessInspectionApi } from './public/identity-access-inspection.api';

/**
 * The account side of `ops:inspect`. Only the inspection graph loads it (module-graph.spec.ts). Exports the read-only contract alone.
 */
@Module({
  imports: [DatabaseModule, IdentityAccessFacadeModule],
  providers: [IdentityAccessInspectionApi],
  exports: [IdentityAccessInspectionApi],
})
export class IdentityAccessInspectionFacadeModule {}
