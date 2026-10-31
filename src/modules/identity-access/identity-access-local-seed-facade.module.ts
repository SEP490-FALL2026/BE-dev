import { Module } from '@nestjs/common';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';
import { LocalDemoAccountApi } from './public/local-demo-account.api';

/**
 * The account side of `pnpm dev:seed` and `pnpm ops:demo-dataset`: demo accounts through the account contracts.
 * Only those two command graphs load it (module-graph.spec.ts); never the API, the worker or another command.
 */
@Module({
  imports: [IdentityAccessFacadeModule],
  providers: [LocalDemoAccountApi],
  exports: [LocalDemoAccountApi],
})
export class IdentityAccessLocalSeedFacadeModule {}
