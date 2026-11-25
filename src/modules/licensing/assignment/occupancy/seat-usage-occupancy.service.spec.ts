import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { LicenseLotApi } from '../../../catalog/public/license-lot.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { DeviceActivationRepo } from '../../device-activation/device-activation.repo';
import { SubscriptionSeatUsageService } from './seat-usage-occupancy.service';
import type { AssignmentRepo } from '../assignment.repo';

describe('SubscriptionSeatUsageService.get (seats taken by assignments and by open machine activations)', () => {
  const setup = (options: {
    purchased: number | null;
    assignments: number;
    activations: number;
    provisioningType?: 'K4';
    lotLicenses?: number;
  }) => {
    const repo = { countOccupying: jest.fn().mockResolvedValue(options.assignments) };
    const deviceActivations = { occupiedBySubscription: jest.fn().mockResolvedValue(options.activations) };
    const catalog = {
      findSeatTarget: jest
        .fn()
        .mockResolvedValue({ purchasedQuantity: options.purchased, provisioningType: options.provisioningType }),
    };
    const lots = {
      findLot: jest
        .fn()
        .mockResolvedValue(options.lotLicenses === undefined ? null : { licenseCount: options.lotLicenses }),
    };
    const organizationReads = { businessToday: jest.fn().mockResolvedValue('2026-11-24') };
    const service = new SubscriptionSeatUsageService(
      repo as unknown as AssignmentRepo,
      deviceActivations as unknown as DeviceActivationRepo,
      organizationReads as unknown as OrganizationReadApi,
      catalog as unknown as CatalogApi,
      lots as unknown as LicenseLotApi,
    );

    return { service, repo, deviceActivations };
  };

  it('counts the open machine activations of a lot of keys on machines as taken (2 open = 2 taken, 0 free of 2)', async () => {
    const { service, deviceActivations } = setup({ purchased: 2, assignments: 0, activations: 2 });

    await expect(service.get('sub-1')).resolves.toEqual({
      subscriptionId: 'sub-1',
      purchased: 2,
      occupied: 2,
      free: 0,
      asOf: '2026-11-24',
    });
    expect(deviceActivations.occupiedBySubscription).toHaveBeenCalledWith('sub-1');
  });

  it('follows the open activations down: 1 open = 1 taken, 1 free; none open = 0 taken', async () => {
    await expect(setup({ purchased: 2, assignments: 0, activations: 1 }).service.get('sub-1')).resolves.toMatchObject({
      occupied: 1,
      free: 1,
    });
    await expect(setup({ purchased: 2, assignments: 0, activations: 0 }).service.get('sub-1')).resolves.toMatchObject({
      occupied: 0,
      free: 2,
    });
  });

  it('keeps the number of a pool of seats (assignments only) and of a purchase with no quantity', async () => {
    await expect(setup({ purchased: 5, assignments: 3, activations: 0 }).service.get('sub-1')).resolves.toMatchObject({
      purchased: 5,
      occupied: 3,
      free: 2,
    });
    await expect(
      setup({ purchased: null, assignments: 4, activations: 0 }).service.get('sub-1'),
    ).resolves.toMatchObject({ purchased: null, occupied: 4, free: null });
  });

  it('counts a lot of a K4 plan once: the licenses of the lot are bought, what the database counts of it is taken, the assignments are not added (DL-2)', async () => {
    const { service, repo } = setup({
      purchased: 1,
      assignments: 3,
      activations: 3,
      provisioningType: 'K4',
      lotLicenses: 5,
    });

    await expect(service.get('lot-1')).resolves.toEqual({
      subscriptionId: 'lot-1',
      purchased: 5,
      occupied: 3,
      free: 2,
      asOf: '2026-11-24',
    });
    expect(repo.countOccupying).not.toHaveBeenCalled();
  });
});
