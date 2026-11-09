import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatBaselinePhaseHook } from '../public/licensing.extension-points';
import { SeatBaselineRepo } from './seat-baseline.repo';

/**
 * Tells the catalog whether the seat baseline of the organization is closed: while it is open a second subscription of the same
 * K2 or K4 plan is only warned about, and once it is closed it is refused (`QĐ-104k`(3)).
 */
@Injectable()
export class SeatBaselinePhaseListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [SeatBaselinePhaseHook] as const;

  constructor(
    private readonly repo: SeatBaselineRepo,
    private readonly hook: SeatBaselinePhaseHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind({ isClosed: (tx, organizationId) => this.isClosed(tx, organizationId) });
  }

  private async isClosed(tx: DbTx, organizationId: string): Promise<boolean> {
    const state = await this.repo.read(organizationId, tx);

    return state.closedAt !== null;
  }
}
