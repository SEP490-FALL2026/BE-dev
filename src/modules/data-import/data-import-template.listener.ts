import { Injectable, OnModuleInit } from '@nestjs/common';
import { ImportTemplateContributions, type ImportTemplateSource } from '../policies/public/policies.extension-points';
import type { ImportTemplateDefinition } from '../policies/public/policies.types';
import { EMPLOYEE_IMPORT_TEMPLATE } from './employee-import/employee-import-template.policy';
import { SEAT_BASELINE_TEMPLATE } from './seat-baseline-import/seat-baseline-template.policy';

/**
 * The people file and the seat baseline file are read here. It adds itself to the sources of the library when the module starts, so the library never imports this module and the template
 * is made from what the parser here reads (`QĐ-111as`).
 */
@Injectable()
export class DataImportTemplateListener implements ImportTemplateSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [ImportTemplateContributions] as const;

  constructor(private readonly sources: ImportTemplateContributions) {}

  onModuleInit(): void {
    this.sources.add('data-import.templates', this);
  }

  definitions(): ImportTemplateDefinition[] {
    return [EMPLOYEE_IMPORT_TEMPLATE, SEAT_BASELINE_TEMPLATE];
  }
}
