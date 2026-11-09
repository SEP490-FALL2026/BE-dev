import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiException } from '../http/errors/api.exception';
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

  it('answers a failed check with 503 SERVICE_UNAVAILABLE, not the generic server-error code (R-12)', async () => {
    const health = { check: jest.fn().mockRejectedValue(new ServiceUnavailableException({ status: 'error' })) };
    const controller = new HealthController(health as never, { pingCheck: jest.fn() } as never, {} as never);

    const outcome = await controller.getReadiness().catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(ApiException);
    expect((outcome as ApiException).getStatus()).toBe(503);
    expect((outcome as ApiException).getResponse()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('logs which dependency failed once, and never the stack, a message or the body of the answer (F93)', async () => {
    const canary = 'canary-4f1c2d9e7a6b-postgres://svc:hunter2@db.internal:5432/slm';
    const failure = new ServiceUnavailableException({
      status: 'error',
      error: { database: { status: 'down', message: canary } },
      details: { database: { status: 'down', message: canary } },
    });
    failure.stack = canary;
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const health = { check: jest.fn().mockRejectedValue(failure) };
    const controller = new HealthController(health as never, { pingCheck: jest.fn() } as never, {} as never);

    try {
      const outcome = await controller.getReadiness().catch((error: unknown) => error);

      expect(logged).toHaveBeenCalledTimes(1);
      // The line is a string holding JSON, so it is read as that and not through the JSON of the mock calls (which would escape it).
      expect(String(logged.mock.calls[0][0])).toContain('"failed":["database"]');
      expect(JSON.stringify(logged.mock.calls)).not.toContain('hunter2');
      expect(JSON.stringify((outcome as ApiException).getResponse())).not.toContain('hunter2');
    } finally {
      logged.mockRestore();
    }
  });

  it('leaves any other failure to the global filter', async () => {
    const defect = new TypeError('boom');
    const health = { check: jest.fn().mockRejectedValue(defect) };
    const controller = new HealthController(health as never, { pingCheck: jest.fn() } as never, {} as never);

    await expect(controller.getReadiness()).rejects.toBe(defect);
  });
});
