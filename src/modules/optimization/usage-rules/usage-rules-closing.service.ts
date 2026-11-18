import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import { GhostSeatSeatStateRepo } from '../ghost-seat/ghost-seat-seat-state.repo';
import type { RulePass } from '../internal-rules/internal-rules.types';
import { planUsageRatesOf } from './plan-usage.policy';

/**
 * What the weekly pass of `G3`/`G4` does once every seat is judged: it forgets the states of the seats that are gone, then leaves to the
 * catalog what it found of the use of each plan priced per seat (`KPI-3`, `QĐ-109d`), which the budget reads below this module (the ZBB of a
 * Renew/Change line, the baseline). The figures of the last pass replace those of the one before, in one transaction.
 */
@Injectable()
export class UsageRulesClosingService {
  constructor(
    private readonly seatStates: GhostSeatSeatStateRepo,
    private readonly catalog: CatalogApi,
    private readonly runner: TransactionRunner,
  ) {}

  async close(pass: RulePass, seats: readonly RuleSeat[]): Promise<void> {
    await this.seatStates.deleteStaleSeatStates(
      pass.organizationId,
      seats.map((seat) => seat.chainRootId),
    );
    const rates = planUsageRatesOf(seats, await this.seatStates.statesOf(pass.organizationId), pass.today);
    await this.runner.run((tx) => this.catalog.replacePlanUsageRates(tx, pass.organizationId, pass.today, rates));
  }
}
