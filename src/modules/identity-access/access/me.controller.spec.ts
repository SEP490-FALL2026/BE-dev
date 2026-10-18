import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PasswordChangeService } from '../auth/password-change.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';

const principal = {} as AuthenticatedPrincipal;
const controllerFailingWith = (error: Error): MeController =>
  new MeController({ get: () => Promise.reject(error) } as unknown as MeService, {} as PasswordChangeService);

describe('MeController — failures after the guard (R-15)', () => {
  it.each([new TransientDatabaseError('57014', new Error('timeout')), new Error('Query read timeout')])(
    'answers 503 SERVICE_UNAVAILABLE for an unreachable database: %s',
    async (error) => {
      const outcome = await controllerFailingWith(error)
        .get(principal)
        .catch((caught: unknown) => caught);

      expect(outcome).toBeInstanceOf(ApiException);
      expect((outcome as ApiException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect((outcome as ApiException).getResponse()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    },
  );

  it('keeps any other failure as it is, so it is reported as an internal error', async () => {
    const defect = new Error('An authenticated principal lost its account or employee record');
    await expect(controllerFailingWith(defect).get(principal)).rejects.toBe(defect);
  });
});
