import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ControlledWaitController } from './controlled-wait.controller';
import type { ControlledWaitQueryService } from './controlled-wait-query.service';
import type { ControlledWaitListQueryDto } from './controlled-wait.dto';

const ACTOR: AuthenticatedPrincipal = {
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId: 'employee-1',
  directRoles: ['SUPER_ADMIN'],
  derivedRoles: [],
  roles: ['SUPER_ADMIN'],
};
const QUERY: ControlledWaitListQueryDto = { page: 1, pageSize: 20 };

const controllerOver = (page: jest.Mock) =>
  new ControlledWaitController({ page } as unknown as ControlledWaitQueryService);

/** The queue of controlled waits answers a database outage with 503 like every guarded route (Prompt 02, 26/10/2026). */
describe('ControlledWaitController.list', () => {
  it('answers a database outage with 503 SERVICE_UNAVAILABLE', async () => {
    const list = controllerOver(jest.fn().mockRejectedValue(new TransientDatabaseError('40001', new Error('reset'))));

    const refused = await list.list(ACTOR, QUERY).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ApiException);
    expect((refused as ApiException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((refused as ApiException).getResponse()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('returns the page of the query service, and lets a defect through unchanged', async () => {
    const page = { items: [], pagination: { page: 1, pageSize: 20, total: 0 } };
    const defect = new Error('a defect');

    await expect(controllerOver(jest.fn().mockResolvedValue(page)).list(ACTOR, QUERY)).resolves.toBe(page);
    await expect(controllerOver(jest.fn().mockRejectedValue(defect)).list(ACTOR, QUERY)).rejects.toBe(defect);
  });
});
