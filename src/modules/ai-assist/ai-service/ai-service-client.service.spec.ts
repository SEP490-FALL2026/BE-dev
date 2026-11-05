import {
  AiServiceAnswerInvalidError,
  AiServiceNotConfiguredError,
  AiServiceTimeoutError,
  AiServiceUnavailableError,
} from './ai-service.errors';
import { HttpAiServiceClient } from './ai-service-client.service';
import type { FetchLike, QueueSummaryServiceRequest } from './ai-service.types';

const INVOCATION = '7d1c3f0e-5b8a-4c1e-9a7b-2f4d6e8a0b1c';
const TOKEN = 'the-service-token-0123456789abcdef';
const SETTINGS = { baseUrl: 'http://ai.internal:8000', token: TOKEN, timeoutMs: 5_000 };

const REQUEST: QueueSummaryServiceRequest = {
  contractVersion: '1',
  invocationId: INVOCATION,
  locale: 'vi',
  context: {
    generatedAt: '2026-11-04T09:00:00.000Z',
    requests: [
      {
        sourceRef: 'R001',
        stepKind: 'NEED_APPROVAL',
        softwareName: 'Figma',
        beneficiaryDisplayName: 'Nguyễn An',
        reason: 'Cần cho dự án thiết kế',
        requestedDurationLabel: '3 tháng',
        estimatedCostRef: null,
      },
    ],
  },
};

const answer = (overrides: Record<string, unknown> = {}) => ({
  contractVersion: '1',
  invocationId: INVOCATION,
  modelId: 'qwen3-4b',
  modelRevision: 'rev-1',
  promptVersion: 'access-request-queue-summary-v1',
  schemaVersion: 'access-request-queue-summary.v1',
  promptText: 'the prompt the model read',
  rawResponse: '{"items":[]}',
  parsed: { items: [{ sourceRef: 'R001', stepKind: 'NEED_APPROVAL', summary: 'Nguyễn An đề nghị Figma.' }] },
  parseStatus: 'OK',
  usage: { promptTokens: 120, completionTokens: 30 },
  latencyMs: 900,
  ...overrides,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const refusal = (status: number, code: string) => json(status, { error: { code, message: `secret detail ${TOKEN}` } });

function clientWith(...replies: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = jest.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (reply === undefined) throw new Error('no more replies');

    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  });
  const sleep = jest.fn<Promise<void>, [ms: number, signal: AbortSignal]>(() => Promise.resolve());

  return { client: new HttpAiServiceClient(SETTINGS, { fetch, sleep }), calls, fetch, sleep };
}

const never = new AbortController().signal;

async function failureOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error('expected a failure');
}

describe('HttpAiServiceClient', () => {
  it('posts the request with the bearer token and the invocation id, and returns the answer of the service', async () => {
    const { client, calls } = clientWith(json(200, answer()));

    const response = await client.summarizeQueue(REQUEST, never);

    expect(response).toEqual(answer());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://ai.internal:8000/v1/summaries/access-request-queue');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({
      Accept: 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'X-Request-Id': INVOCATION,
    });
    expect(JSON.parse(calls[0].init.body as string)).toEqual(REQUEST);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps a path of the base address and drops its trailing slash', async () => {
    const fetch: FetchLike = jest.fn(() => Promise.resolve(json(200, answer())));
    const client = new HttpAiServiceClient({ ...SETTINGS, baseUrl: 'https://ai.internal/base/' }, { fetch });

    await client.summarizeQueue(REQUEST, never);

    expect(fetch).toHaveBeenCalledWith('https://ai.internal/base/v1/summaries/access-request-queue', expect.anything());
  });

  it('returns an answer the model could not shape, for the caller to keep and fail', async () => {
    const unparsed = answer({ parseStatus: 'INVALID_JSON', parsed: null, rawResponse: 'not json' });
    const { client } = clientWith(json(200, unparsed));

    await expect(client.summarizeQueue(REQUEST, never)).resolves.toEqual(unparsed);
  });

  it.each([
    ['a body that is not JSON', new Response('<html>oops</html>', { status: 200 })],
    ['a field the contract does not have', json(200, answer({ extra: true }))],
    ['another contract version', json(200, answer({ contractVersion: '2' }))],
    ['the answer of another invocation', json(200, answer({ invocationId: 'a2c4e6f8-0000-4000-8000-000000000000' }))],
    ['an OK parse without parsed items', json(200, answer({ parsed: null }))],
    ['a parsed line of the wrong shape', json(200, answer({ parsed: { items: [{ sourceRef: 'X1', summary: 'x' }] } }))],
    [
      'a summary over 400 characters',
      json(
        200,
        answer({ parsed: { items: [{ sourceRef: 'R001', stepKind: 'NEED_APPROVAL', summary: 'x'.repeat(401) }] } }),
      ),
    ],
    ['parsed items while the parse failed', json(200, answer({ parseStatus: 'SCHEMA_MISMATCH' }))],
  ])('refuses %s as an invalid answer, without retrying', async (_label, reply) => {
    const { client, calls } = clientWith(reply);

    await expect(client.summarizeQueue(REQUEST, never)).rejects.toThrow(AiServiceAnswerInvalidError);
    expect(calls).toHaveLength(1);
  });

  it.each([
    [503, 'MODEL_LOADING'],
    [429, 'BUSY'],
    [500, 'MODEL_ERROR'],
  ])('tries a %i (%s) once more after two seconds', async (status, code) => {
    const { client, calls, sleep } = clientWith(refusal(status, code), json(200, answer()));

    await expect(client.summarizeQueue(REQUEST, never)).resolves.toEqual(answer());
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2_000, expect.any(AbortSignal));
  });

  it('reports the service as unavailable when the second try is refused too, with its status and code only', async () => {
    const { client, calls } = clientWith(refusal(503, 'MODEL_LOADING'), refusal(503, 'MODEL_LOADING'));

    const error = await failureOf(client.summarizeQueue(REQUEST, never));

    expect(error).toBeInstanceOf(AiServiceUnavailableError);
    expect(error).toMatchObject({ status: 503, serviceCode: 'MODEL_LOADING' });
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).not.toContain('secret detail');
    expect(calls).toHaveLength(2);
  });

  it.each([
    [400, 'CONTEXT_INVALID'],
    [401, 'UNAUTHORIZED'],
    [409, 'CONTRACT_VERSION_MISMATCH'],
    [413, 'CONTEXT_TOO_LARGE'],
  ])('never retries a %i (%s)', async (status, code) => {
    const { client, calls } = clientWith(refusal(status, code));

    const error = await failureOf(client.summarizeQueue(REQUEST, never));

    expect(error).toBeInstanceOf(AiServiceUnavailableError);
    expect(error).toMatchObject({ status, serviceCode: code });
    expect(calls).toHaveLength(1);
  });

  it('keeps no code that is not one of the contract', async () => {
    const { client } = clientWith(json(400, { error: { code: 'Nguyễn An', message: 'x' } }));

    await expect(failureOf(client.summarizeQueue(REQUEST, never))).resolves.toMatchObject({ serviceCode: null });
  });

  it('takes a 504 as the model running out of time, without retrying', async () => {
    const { client, calls } = clientWith(refusal(504, 'MODEL_TIMEOUT'));

    await expect(client.summarizeQueue(REQUEST, never)).rejects.toThrow(AiServiceTimeoutError);
    expect(calls).toHaveLength(1);
  });

  it('tries a refused connection once more, then reports the service unavailable', async () => {
    const refused = () =>
      new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) });
    const { client, calls } = clientWith(refused(), refused());

    const error = await failureOf(client.summarizeQueue(REQUEST, never));

    expect(error).toBeInstanceOf(AiServiceUnavailableError);
    expect(error).toMatchObject({ status: null, serviceCode: null });
    expect(calls).toHaveLength(2);
  });

  it('gives up when the whole call, retry included, runs past the timeout', async () => {
    const fetch: FetchLike = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const client = new HttpAiServiceClient({ ...SETTINGS, timeoutMs: 20 }, { fetch });

    await expect(client.summarizeQueue(REQUEST, never)).rejects.toThrow(AiServiceTimeoutError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops when the caller aborts, as the service being unavailable', async () => {
    const caller = new AbortController();
    caller.abort();
    const fetch: FetchLike = jest.fn(() => Promise.reject(new Error('aborted')));
    const client = new HttpAiServiceClient(SETTINGS, { fetch });

    await expect(client.summarizeQueue(REQUEST, caller.signal)).rejects.toThrow(AiServiceUnavailableError);
  });

  it('says it is not configured and sends nothing when no service is set', async () => {
    const fetch: FetchLike = jest.fn();
    const client = new HttpAiServiceClient(null, { fetch });

    expect(client.configured()).toBe(false);
    expect(new HttpAiServiceClient(SETTINGS, { fetch }).configured()).toBe(true);
    await expect(client.summarizeQueue(REQUEST, never)).rejects.toThrow(AiServiceNotConfiguredError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
