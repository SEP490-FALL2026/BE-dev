import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ImportTemplateContributions,
  type ImportTemplateSource,
} from '../../policies/public/policies.extension-points';
import type { ImportTemplateDefinition } from '../../policies/public/policies.types';
import { USAGE_REPORT_TEMPLATE } from './vendor-import-template.policy';

/**
 * The usage report of a vendor is read here. It adds itself to the sources of the library when the module starts, so the library never imports this module and the template
 * is made from what the parser here reads (`QĐ-111as`).
 */
@Injectable()
export class VendorImportTemplateListener implements ImportTemplateSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [ImportTemplateContributions] as const;

  constructor(private readonly sources: ImportTemplateContributions) {}

  onModuleInit(): void {
    this.sources.add('usage.vendor-import-template', this);
  }

  definitions(): ImportTemplateDefinition[] {
    return [USAGE_REPORT_TEMPLATE];
  }
}
