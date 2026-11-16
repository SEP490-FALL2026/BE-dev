import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { FunctionalGroupRepo } from './functional-group/functional-group.repo';
import { CatalogBootstrapApi } from './public/catalog-bootstrap.api';

/** What the installation command needs of the catalog: no HTTP controllers, storage or lifecycle listeners. */
@Module({
  imports: [DatabaseModule],
  providers: [FunctionalGroupRepo, CatalogBootstrapApi],
  exports: [CatalogBootstrapApi],
})
export class CatalogBootstrapFacadeModule {}
