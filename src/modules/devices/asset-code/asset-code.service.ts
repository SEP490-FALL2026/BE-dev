import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DeviceAssetCodeExhaustedError } from './asset-code.errors';
import { type AssetDeviceType, formatAssetCode } from './asset-code.policy';
import { AssetCodeRepo } from './asset-code.repo';

/**
 * Gives a new machine its asset code `TYPE-YY-NNNN`.
 *
 * Lock order: this takes ONE lock, the row of `device_code_counters` for (type, year) — tier 0c of the order in
 * `docs/rules/database-business.md` — and the caller takes it after the seat-baseline row (0b, when it holds one) and before any lock on a
 * machine. A number is never given twice, not even to a record that is voided later: the counter only goes up. The caller's transaction
 * is the one that holds the lock, so it also inserts the machine; a transaction that rolls back gives the number back.
 */
@Injectable()
export class AssetCodeService {
  constructor(private readonly codes: AssetCodeRepo) {}

  /**
   * The next code for a kind of machine. The year is the year of `today`, the business day of the organization, so a machine entered
   * on 31 December in its time zone does not take the code of the next year.
   */
  async next(tx: DbTx, deviceType: AssetDeviceType, today: BusinessDate): Promise<string> {
    const year = Number(today.slice(0, 4));
    const number = await this.codes.takeNext(tx, deviceType, year);
    if (number === null) throw new DeviceAssetCodeExhaustedError();

    return formatAssetCode(deviceType, year, number);
  }
}
