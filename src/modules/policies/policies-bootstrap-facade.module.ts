import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { InitialPoliciesService } from './initial/initial-policies.service';
import { LibraryRepo } from './library/library.repo';
import { PoliciesBootstrapApi } from './public/policies-bootstrap.api';

/**
 * The small part of the library the installation needs: writing the fixed set of policies with their first version. It has no controller
 * and no other dependency, so the installation command does not load the library itself. The library module imports it for the repository.
 */
@Module({
  imports: [DatabaseModule],
  providers: [LibraryRepo, InitialPoliciesService, PoliciesBootstrapApi],
  exports: [PoliciesBootstrapApi, LibraryRepo],
})
export class PoliciesBootstrapFacadeModule {}
