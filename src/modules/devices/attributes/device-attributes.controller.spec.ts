import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DeviceNotInChargeError } from '../public/devices.errors';
import type { RegistryQueryService } from '../registry/registry-query.service';
import { DeviceAttributesController } from './device-attributes.controller';
import type { DeviceAttributesService } from './device-attributes.service';

describe('DeviceAttributesController', () => {
  const actor = { appUserId: 'user-1', employeeId: 'emp-1', roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;
  const read = new Date('2026-11-24T09:00:00.000Z');

  it('answers the correction with the detail of the machine read after the write, not with the short view of the write', async () => {
    const detail = { id: 'dev-1', assetCode: 'LAP-26-0001', custody: 'IN_STOCK', condition: 'USABLE' };
    const change = jest.fn().mockResolvedValue({ id: 'dev-1', updatedAt: new Date() });
    const get = jest.fn().mockResolvedValue(detail);
    const controller = new DeviceAttributesController(
      { change } as unknown as DeviceAttributesService,
      { get } as unknown as RegistryQueryService,
    );

    const answer = await controller.update(
      actor,
      { id: 'dev-1' },
      {
        expectedUpdatedAt: read.toISOString(),
        hostname: 'DES-02',
      },
    );

    expect(answer).toBe(detail);
    expect(change).toHaveBeenCalledWith(actor, 'dev-1', { hostname: 'DES-02', expectedUpdatedAt: read });
    expect(get).toHaveBeenCalledWith('dev-1');
  });

  it('answers 403 DEVICE.NOT_IN_CHARGE and reads nothing when the correction is refused', async () => {
    const get = jest.fn();
    const controller = new DeviceAttributesController(
      { change: jest.fn().mockRejectedValue(new DeviceNotInChargeError()) } as unknown as DeviceAttributesService,
      { get } as unknown as RegistryQueryService,
    );

    await expect(
      controller.update(actor, { id: 'dev-1' }, { expectedUpdatedAt: read.toISOString(), hostname: 'DES-02' }),
    ).rejects.toMatchObject({ response: { code: 'DEVICE.NOT_IN_CHARGE' } });
    expect(get).not.toHaveBeenCalled();
  });
});
