import { Module } from '@nestjs/common';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';
import { LocalDemoAccountService } from './local-demo-account.service';

/**
 * The account side of `pnpm dev:seed` (H6.2): local demo accounts through the account contracts. Only the seed graph
 * loads it (module-graph.spec.ts); never the API, the worker or another command.
 */
@Module({
  imports: [IdentityAccessFacadeModule],
  providers: [LocalDemoAccountService],
  exports: [LocalDemoAccountService],
})
export class IdentityAccessLocalSeedFacadeModule {}
