import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DeviceAssetCodeExhaustedError } from './asset-code.errors';
import { AssetCodeService } from './asset-code.service';

describe('AssetCodeService', () => {
  const tx = { tag: 'tx' } as unknown as DbTx;

  it('takes the next counter number for the device type and year of today and formats the asset code', async () => {
    const takeNext = jest.fn().mockResolvedValue(14);
    const service = new AssetCodeService({ takeNext });

    const code = await service.next(tx, 'LAP', '2026-12-31');

    expect(takeNext).toHaveBeenCalledWith(tx, 'LAP', 2026);
    expect(code).toBe('LAP-26-0014');
  });

  it('uses the business date year across all device types and pads four digits', async () => {
    const takeNext = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(9999);
    const service = new AssetCodeService({ takeNext });

    await expect(service.next(tx, 'PC', '2027-01-01')).resolves.toBe('PC-27-0001');
    await expect(service.next(tx, 'OTH', '2030-06-15')).resolves.toBe('OTH-30-9999');
    expect(takeNext).toHaveBeenNthCalledWith(1, tx, 'PC', 2027);
    expect(takeNext).toHaveBeenNthCalledWith(2, tx, 'OTH', 2030);
  });

  it('throws DeviceAssetCodeExhaustedError when all four-digit numbers for the type and year are exhausted', async () => {
    const takeNext = jest.fn().mockResolvedValue(null);
    const service = new AssetCodeService({ takeNext });

    await expect(service.next(tx, 'LAP', '2026-05-01')).rejects.toBeInstanceOf(DeviceAssetCodeExhaustedError);
  });
});
