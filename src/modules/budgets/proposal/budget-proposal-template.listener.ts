import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ImportTemplateContributions,
  type ImportTemplateSource,
} from '../../policies/public/policies.extension-points';
import type { ImportTemplateDefinition } from '../../policies/public/policies.types';
import { BUDGET_PROPOSAL_TEMPLATE } from './budget-proposal-template.policy';

/**
 * The form BM-10 of a proposal is kept here, though never read. It adds itself to the sources of the library when the module starts, so the library never imports this module and the template
 * is made from what the parser here reads (`QĐ-111as`).
 */
@Injectable()
export class BudgetProposalTemplateListener implements ImportTemplateSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [ImportTemplateContributions] as const;

  constructor(private readonly sources: ImportTemplateContributions) {}

  onModuleInit(): void {
    this.sources.add('budgets.budget-proposal-template', this);
  }

  definitions(): ImportTemplateDefinition[] {
    return [BUDGET_PROPOSAL_TEMPLATE];
  }
}
