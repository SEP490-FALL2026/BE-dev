import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController readiness', () => {
  it('maps Terminus details onto the wire shape', async () => {
    const health = {
      check: jest.fn().mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      }),
    };
    const controller = new HealthController(health as never, { pingCheck: jest.fn() } as never, {} as never);

    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ready',
      checks: [{ name: 'database', status: 'up' }],
    });
  });

  it('propagates the Terminus failure so the filter maps it to 503', async () => {
    const failure = new ServiceUnavailableException({ status: 'error' });
    const health = { check: jest.fn().mockRejectedValue(failure) };
    const controller = new HealthController(health as never, { pingCheck: jest.fn() } as never, {} as never);

    await expect(controller.getReadiness()).rejects.toBe(failure);
  });
});
