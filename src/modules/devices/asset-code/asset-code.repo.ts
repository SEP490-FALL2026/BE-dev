import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { type AssetDeviceType, nextAssetNumber } from './asset-code.policy';

/** The one writer of `device_code_counters`: one row for each (type, year) holds the last number issued. */
@Injectable()
export class AssetCodeRepo {
  /**
   * The next number for a type and a year, taken under the lock of the row of the counter, or null when every number was issued (the
   * counter is then left as it is). The row is made on first use (`ON CONFLICT DO NOTHING`) and read `FOR UPDATE`, so two transactions that
   * ask at once are told one after the other. Pattern: `SaasIssueRepo.nextCode`.
   */
  async takeNext(tx: DbTx, type: AssetDeviceType, year: number): Promise<number | null> {
    await tx.$executeRaw`
      INSERT INTO device_code_counters (device_type, year, last_value)
      VALUES (${type}::"DeviceType", ${year}::smallint, 0) ON CONFLICT (device_type, year) DO NOTHING`;
    const counter = await tx.$queryRaw<{ last_value: number }[]>`
      SELECT last_value FROM device_code_counters
       WHERE device_type = ${type}::"DeviceType" AND year = ${year}::smallint FOR UPDATE`;
    const next = nextAssetNumber(counter[0].last_value);
    if (next === null) return null;
    await tx.$executeRaw`
      UPDATE device_code_counters SET last_value = ${next}::int
       WHERE device_type = ${type}::"DeviceType" AND year = ${year}::smallint`;

    return next;
  }
}
