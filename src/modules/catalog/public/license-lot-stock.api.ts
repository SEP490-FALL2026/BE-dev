import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LotChoiceResult } from '../license-lot/license-lot-price.policy';
import {
  LicenseLotStockService,
  type AccountLotVacancy,
  type RequestLotReservation,
} from '../license-lot/license-lot-stock.service';
import type { LicenseLotPurpose } from './license-lot.types';

export type { AccountLotVacancy, RequestLotReservation };

export interface LicenseLotStockItem {
  id: string;
  purchasedOn: BusinessDate;
  licenseCount: number;
  unitPriceMinor: bigint;
  purpose: LicenseLotPurpose;
  requestId: string | null;
  legacySubscriptionId: string | null;
  free: number;
  keysInStore: number;
  openTasksWithoutKey: number;
  grantable: number;
  excessGrantable: number;
}

/**
 * Public catalog facade for K4 license-lot stock, selection (`W3-24`, `F11`), and G1 vacancies (`W3-26`).
 */
@Injectable()
export class LicenseLotStockApi {
  constructor(private readonly stock: LicenseLotStockService) {}

  accountLotCandidates(
    planId: string,
    options?: {
      reservations?: ReadonlyMap<string, RequestLotReservation>;
      excludeTaskId?: string;
    },
    tx?: DbTx,
  ): Promise<LicenseLotStockItem[]> {
    return this.stock.accountLotCandidates(planId, options, tx);
  }

  chooseAccountLot(
    input: {
      planId: string;
      ownRequestId: string | null;
      reservations?: ReadonlyMap<string, RequestLotReservation>;
      excludeTaskId?: string;
    },
    tx?: DbTx,
  ): Promise<LotChoiceResult> {
    return this.stock.chooseAccountLot(input, tx);
  }

  listAccountVacancies(asOf: BusinessDate, tx?: DbTx): Promise<AccountLotVacancy[]> {
    return this.stock.listAccountVacancies(asOf, tx);
  }

  newestFreeLotUnitPrice(planId: string, tx?: DbTx): Promise<bigint | null> {
    return this.stock.newestFreeLotUnitPrice(planId, tx);
  }
}
