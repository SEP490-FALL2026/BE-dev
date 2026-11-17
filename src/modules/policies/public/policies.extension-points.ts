import { Injectable } from '@nestjs/common';
import { Contributions } from '../../../core/extension/contributions';
import type { ImportTemplateDefinition } from './policies.types';

/** A module that reads a file an IT Admin, a head or Finance prepares, and so knows what the columns of that file are. */
export interface ImportTemplateSource {
  definitions(): ImportTemplateDefinition[];
}

/**
 * Who tells the library what the columns of each kind of import file are (`QĐ-111as`): `data-import`, `licensing`, `usage` and `budgets` sit above
 * the library and each adds one source from a `*.listener.ts`, so the library never imports a parser and a template is made from what the parser
 * reads. Held by the library module, one per application; a kind nobody added is not available.
 */
@Injectable()
export class ImportTemplateContributions extends Contributions<ImportTemplateSource> {
  constructor() {
    super('policies.import-templates');
  }
}
