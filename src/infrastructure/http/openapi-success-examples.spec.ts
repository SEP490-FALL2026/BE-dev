import { SUCCESS_MESSAGE_EXTENSION, withSuccessMessageExamples } from './openapi-success-examples';

const DTO = { $ref: '#/components/schemas/ThingResponseDto' };

describe('withSuccessMessageExamples (OPENAPI-EXAMPLE.1)', () => {
  const source = () => ({
    openapi: '3.0.0',
    paths: {
      '/things': {
        get: {
          responses: {
            '200': {
              description: 'ok',
              [SUCCESS_MESSAGE_EXTENSION]: 'THING.LISTED',
              content: { 'application/json': { schema: DTO } },
            },
            '404': { description: 'missing', content: { 'application/json': { schema: { $ref: '#/x' } } } },
          },
        },
        delete: { responses: { '204': { description: 'gone' } } },
      },
    },
  });

  it('overlays the declared message on the DTO reference and drops the internal extension', () => {
    const responses = withSuccessMessageExamples(source()).paths['/things'].get.responses;

    expect(responses['200']).toEqual({
      description: 'ok',
      content: {
        'application/json': { schema: { allOf: [DTO, { properties: { message: { example: 'THING.LISTED' } } }] } },
      },
    });
  });

  it('leaves responses without the extension, and responses without a body, as they are', () => {
    const result = withSuccessMessageExamples(source()).paths['/things'];

    expect(result.get.responses['404']).toEqual(source().paths['/things'].get.responses['404']);
    expect(result.delete.responses['204']).toEqual({ description: 'gone' });
  });

  it('does not modify the document it is given', () => {
    const input = source();
    const snapshot = JSON.stringify(input);

    withSuccessMessageExamples(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
