import {
  MALFORMED_BODY_DESCRIPTION,
  REQUEST_BODY_LIMIT_DESCRIPTION,
  UNSUPPORTED_BODY_DESCRIPTION,
  withRequestParserResponses,
} from './openapi-request-parser';

const ERROR_ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };
const OWN_400 = {
  description: 'The link is not valid (unknown, used, replaced, expired).',
  content: { 'application/json': { schema: ERROR_ENVELOPE } },
};
const UPLOAD_413 = {
  description: 'The file is larger than 2 MiB (HTTP_PAYLOAD_TOO_LARGE).',
  content: { 'application/json': { schema: ERROR_ENVELOPE } },
};
const JSON_BODY = { content: { 'application/json': { schema: { type: 'object' } } } };

type Operation = { operationId: string; responses: Record<string, { description?: string }> };
type Document = { openapi: string; paths: Record<string, Record<string, unknown>> };

const responsesOf = (document: Document, path: string, method: string) =>
  (document.paths[path][method] as Operation).responses;

describe('withRequestParserResponses (P29-N1, P29-N4)', () => {
  const source = (): Document => ({
    openapi: '3.0.0',
    paths: {
      '/items': {
        parameters: [{ name: 'trace', in: 'header' }],
        get: { operationId: 'itemList', responses: { '200': { description: 'ok' } } },
        post: { operationId: 'itemCreate', requestBody: JSON_BODY, responses: { '201': { description: 'created' } } },
      },
      '/links': {
        post: { operationId: 'linkRedeem', requestBody: JSON_BODY, responses: { '400': structuredClone(OWN_400) } },
      },
      '/uploads': {
        post: {
          operationId: 'upload',
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object' } } } },
          responses: { '413': UPLOAD_413 },
        },
      },
    },
  });

  it('adds the 400, 413 and 415 of the parser, with the error envelope, to an operation that takes a JSON body', () => {
    const responses = responsesOf(withRequestParserResponses(source()), '/items', 'post');
    const envelope = { content: { 'application/json': { schema: ERROR_ENVELOPE } } };

    expect(responses['400']).toEqual({ description: MALFORMED_BODY_DESCRIPTION, ...envelope });
    expect(responses['413']).toEqual({ description: REQUEST_BODY_LIMIT_DESCRIPTION, ...envelope });
    expect(responses['415']).toEqual({ description: UNSUPPORTED_BODY_DESCRIPTION, ...envelope });
    expect([MALFORMED_BODY_DESCRIPTION, REQUEST_BODY_LIMIT_DESCRIPTION, UNSUPPORTED_BODY_DESCRIPTION]).toEqual([
      expect.stringContaining('HTTP_BAD_REQUEST'),
      expect.stringContaining('100 KiB'),
      expect.stringContaining('HTTP_UNSUPPORTED_MEDIA_TYPE'),
    ]);
  });

  it('keeps an operation’s own 400 and appends the parser’s meaning once, also when applied twice', () => {
    const once = withRequestParserResponses(source());
    const twice = withRequestParserResponses(once);

    expect(responsesOf(twice, '/links', 'post')['400']).toEqual({
      ...OWN_400,
      description: `${OWN_400.description} ${MALFORMED_BODY_DESCRIPTION}`,
    });
  });

  it('leaves operations without a JSON body alone, the multipart upload’s own 413 included', () => {
    const result = withRequestParserResponses(source());

    expect(responsesOf(result, '/items', 'get')).toEqual({ '200': { description: 'ok' } });
    expect(responsesOf(result, '/uploads', 'post')).toEqual({ '413': UPLOAD_413 });
  });

  it('does not modify the document it is given', () => {
    const input = source();
    const snapshot = JSON.stringify(input);

    withRequestParserResponses(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
