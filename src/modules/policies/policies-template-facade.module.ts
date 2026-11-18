import { Module } from '@nestjs/common';
import { ImportTemplateContributions } from './public/policies.extension-points';

/**
 * The one point the modules that read import files add their columns to (`QĐ-111as`). It holds nothing else, so `data-import`, `licensing`,
 * `usage` and `budgets` can bind to it without loading the library; the library module imports it to build the files.
 */
@Module({
  providers: [ImportTemplateContributions],
  exports: [ImportTemplateContributions],
})
export class PoliciesTemplateFacadeModule {}
