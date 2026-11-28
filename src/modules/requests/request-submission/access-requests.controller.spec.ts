import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { ApplicationZodValidationPipe } from '../../../infrastructure/http/pipes/zod-validation.pipe';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AccessRequestNotFoundError,
  AccessRequestReplyNoteRequiredError,
} from '../access-request/access-request.errors';
import { ResubmitAccessRequestDto } from '../request-intake/request-resubmission.dto';
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
 * Reading a request through `accessRequestGet`: the request when the caller may see it, else the caller's own draft,
 * else the one answer of a request that does not exist. Only a miss reaches for the draft; any other failure is not a miss.
 */
describe('AccessRequestsController.get', () => {
  const queries = { get: jest.fn() };
  const drafts = { readOwn: jest.fn() };
  const controller = new AccessRequestsController(
    {} as never,
    {} as never,
    {} as never,
    queries as never,
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

describe('AccessRequestsController.resubmit', () => {
  const resubmissions = { resubmit: jest.fn() };
  const queries = { view: jest.fn() };
  const controller = new AccessRequestsController(
    {} as never,
    resubmissions as never,
    {} as never,
    queries as never,
    {} as never,
  );
  const pipe = new ApplicationZodValidationPipe();
  const transformBody = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: ResubmitAccessRequestDto }) as ResubmitAccessRequestDto;

  beforeEach(() => jest.resetAllMocks());

  it('accepts empty body, undefined body, and trimmed replyNote up to 1000 chars', () => {
    expect(transformBody(undefined)).toEqual({});
    expect(transformBody({})).toEqual({});
    expect(transformBody({ replyNote: '  Clarified scope  ' })).toEqual({ replyNote: 'Clarified scope' });
    const exact1000 = 'a'.repeat(1000);
    expect(transformBody({ replyNote: exact1000 })).toEqual({ replyNote: exact1000 });
  });

  it.each([
    ['whitespace-only replyNote', { replyNote: '   ' }],
    ['1001-char replyNote', { replyNote: 'a'.repeat(1001) }],
    ['unknown field', { extra: 'bad' }],
  ])('rejects %s with 422 VALIDATION_ERROR', (_label, payload) => {
    const error = (() => {
      try {
        transformBody(payload);
        return null;
      } catch (err) {
        return err;
      }
    })();

    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(422);
    expect((error as ApiException).getResponse()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('maps AccessRequestReplyNoteRequiredError to 422 ACCESS_REQUEST.REPLY_NOTE_REQUIRED with returnedStepId', async () => {
    resubmissions.resubmit.mockRejectedValue(new AccessRequestReplyNoteRequiredError('step-ret-1'));

    const outcome = await controller.resubmit(actor, { id: 'r-1' }, {}).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(ApiException);
    expect((outcome as ApiException).getStatus()).toBe(422);
    expect((outcome as ApiException).getResponse()).toMatchObject({
      code: 'ACCESS_REQUEST.REPLY_NOTE_REQUIRED',
      details: { returnedStepId: 'step-ret-1' },
    });
  });

  it('forwards validated body to resubmissions.resubmit and defaults omitted body to {}', async () => {
    const date = new Date('2026-06-01T00:00:00.000Z');
    const view = {
      id: 'r-1',
      submittedAt: date,
      needStep: { id: 's-1', state: 'PENDING', createdAt: date, assignedAt: null, decidedAt: null },
      needDecision: null,
      withdrawal: null,
      cancellation: null,
      serviceAccount: null,
      renewal: null,
    };
    resubmissions.resubmit.mockResolvedValue({ id: 'r-1' });
    queries.view.mockResolvedValue(view);

    await expect(controller.resubmit(actor, { id: 'r-1' })).resolves.toMatchObject({
      request: { id: 'r-1', submittedAt: date.toISOString() },
    });
    expect(resubmissions.resubmit).toHaveBeenCalledWith(actor, 'r-1', {});
  });
});
