import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestsController } from './access-requests.controller';

const actor = { employeeId: 'e-owner' } as unknown as AuthenticatedPrincipal;
const DRAFT = {
  id: 'r-1',
  kind: 'INDIVIDUAL',
  departmentId: 'd-1',
  planId: 'p-1',
  beneficiaryCount: 1,
  createdAt: '2026-10-28T02:00:00.000Z',
};

/**
 * Reading a request through `accessRequestGet` (spec L.1, F92): the request when the caller may see it, else the caller's own draft,
 * else the one answer of a request that does not exist. Only a miss reaches for the draft; any other failure is not a miss.
 */
describe('AccessRequestsController.get', () => {
  const queries = { get: jest.fn() };
  const drafts = { readOwn: jest.fn() };
  const controller = new AccessRequestsController(
    {} as never,
    {} as never,
    queries as never,
    {} as never,
    {} as never,
    {} as never,
    drafts as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('answers the caller their own draft, as `draft`, when no request they may see has that id', async () => {
    queries.get.mockRejectedValue(new AccessRequestNotFoundError());
    drafts.readOwn.mockResolvedValue(DRAFT);

    await expect(controller.get(actor, { id: 'r-1' })).resolves.toEqual({ draft: DRAFT });

    expect(drafts.readOwn).toHaveBeenCalledWith(actor, 'r-1');
  });

  it('answers a miss as 404 ACCESS_REQUEST.NOT_FOUND when the caller has no draft with that id either', async () => {
    queries.get.mockRejectedValue(new AccessRequestNotFoundError());
    drafts.readOwn.mockResolvedValue(null);

    const outcome = await controller.get(actor, { id: 'r-1' }).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(ApiException);
    expect((outcome as ApiException).getStatus()).toBe(404);
    expect((outcome as ApiException).getResponse()).toMatchObject({ code: 'ACCESS_REQUEST.NOT_FOUND' });
  });

  it('does not look for a draft when the read failed for any other reason: the failure is not hidden behind a miss', async () => {
    const failure = new Error('the database did not answer');
    queries.get.mockRejectedValue(failure);

    await expect(controller.get(actor, { id: 'r-1' })).rejects.toBe(failure);

    expect(drafts.readOwn).not.toHaveBeenCalled();
  });
});
