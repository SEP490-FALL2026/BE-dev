import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CarriedOverContributions, type CarriedOverContribution } from '../../budgets/public/budgets.extension-points';
import { YearStartCarriedOverService } from './year-start-carried-over.service';

/**
 * Tells the budgets what each Cost Center carries into the year they make the budget for (`QĐ-111ac`, `QĐ-111k`): what the pass of 01/01 of
 * that year would commit in it, worked out now by the same rule and without writing anything (`YearStartCarriedOverService`). It adds itself
 * to the budgets' contributions when the module starts, so the budgets never import this module (ADR-0016).
 */
@Injectable()
export class CarriedOverListener implements CarriedOverContribution, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [CarriedOverContributions] as const;

  constructor(
    private readonly contributions: CarriedOverContributions,
    private readonly carried: YearStartCarriedOverService,
  ) {}

  onModuleInit(): void {
    this.contributions.add('requests.carried-over', this);
  }

  carriedOverOf(costCenterIds: readonly string[], year: number, tx?: DbTx): Promise<Map<string, bigint>> {
    return this.carried.carriedOverOf(costCenterIds, year, tx);
  }
}
