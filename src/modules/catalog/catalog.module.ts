import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CatalogController } from './catalog.controller';
import { CatalogRepo } from './catalog.repo';
import { CatalogService } from './catalog.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogRepo],
  // CatalogRepo is deliberately NOT exported: other modules go through the facade.
  exports: [CatalogService],
})
export class CatalogModule {}
