import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { IdentityAccessRepo } from './identity-access.repo';
import { IdentityAccessService } from './identity-access.service';
import { PasswordHasher } from './password-hasher.service';

/**
 * IdentityAccessService is the public facade other modules (installation) use. The repo and the
 * hasher are exported only so IdentityAccessModule, in the same folder and owned by the same table
 * owner, shares one instance of each instead of declaring a second copy.
 */
@Module({
  imports: [DatabaseModule],
  providers: [IdentityAccessRepo, PasswordHasher, IdentityAccessService],
  exports: [IdentityAccessService, IdentityAccessRepo, PasswordHasher],
})
export class IdentityAccessFacadeModule {}
