import { GLOBAL_RATE_LIMIT_DESCRIPTION, withGlobalRateLimitResponse } from './openapi-rate-limit';

const ERROR_ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };
const LOCKOUT = {
  description: 'Too many failed sign-in attempts (AUTH.LOGIN_TEMPORARILY_BLOCKED), or HTTP_TOO_MANY_REQUESTS.',
  content: { 'application/json': { schema: ERROR_ENVELOPE } },
};

/** What the filter answers for a throttled request (written out, not asked of the filter). */
const THROTTLED = {
  HTTP_TOO_MANY_REQUESTS: {
    summary: 'The request could not be processed.',
    value: {
      success: false,
      error: {
        code: 'HTTP_TOO_MANY_REQUESTS',
        message: 'The request could not be processed.',
        requestId: 'req_example',
      },
    },
  },
};

type Operation = { operationId: string; responses: Record<string, unknown> };
type Document = { openapi: string; paths: Record<string, Record<string, unknown>> };

const responsesOf = (document: Document, path: string, method: string): Record<string, unknown> =>
  (document.paths[path][method] as Operation).responses;

describe('withGlobalRateLimitResponse', () => {
  const source = (): Document => ({
    openapi: '3.0.0',
    paths: {
      '/items': {
        parameters: [{ name: 'trace', in: 'header' }],
        get: { operationId: 'itemList', responses: { '200': { description: 'ok' } } },
        post: { operationId: 'itemCreate', responses: { '201': { description: 'created' }, '429': LOCKOUT } },
      },
      '/items/{id}': { delete: { operationId: 'itemRemove', responses: {} } },
    },
  });

  it('adds the global 429 with the error envelope to every operation that declares none', () => {
    const result = withGlobalRateLimitResponse(source());
    const expected = {
      description: GLOBAL_RATE_LIMIT_DESCRIPTION,
      content: { 'application/json': { schema: ERROR_ENVELOPE, examples: THROTTLED } },
    };

    expect(responsesOf(result, '/items', 'get')['429']).toEqual(expected);
    expect(responsesOf(result, '/items/{id}', 'delete')['429']).toEqual(expected);
    expect(GLOBAL_RATE_LIMIT_DESCRIPTION).toContain('HTTP_TOO_MANY_REQUESTS');
  });

  it('keeps an operation’s own 429, which must already name the global branch, and adds its example once', () => {
    const result = withGlobalRateLimitResponse(withGlobalRateLimitResponse(source()));

    expect(responsesOf(result, '/items', 'post')['429']).toEqual({
      description: LOCKOUT.description,
      content: { 'application/json': { schema: ERROR_ENVELOPE, examples: THROTTLED } },
    });
  });

  it('leaves everything else alone and does not modify the document it is given', () => {
    const input = source();
    const snapshot = JSON.stringify(input);
    const result = withGlobalRateLimitResponse(input);

    expect(result.paths['/items'].parameters).toEqual([{ name: 'trace', in: 'header' }]);
    expect(responsesOf(result, '/items', 'get')['200']).toEqual({ description: 'ok' });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
