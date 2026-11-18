import { HttpStatus, NotFoundException } from '@nestjs/common';
import { errorEnvelopeSchema } from './dto/error-envelope.dto';
import { ApiException } from './errors/api.exception';
import {
  EXAMPLE_REQUEST_ID,
  errorExampleOf,
  toNamedErrorExamples,
  withErrorExamples,
  type ErrorExample,
} from './openapi-error-examples';

const NOT_FOUND: ErrorExample = { code: 'THING.NOT_FOUND', message: 'The thing does not exist.' };
const IN_USE: ErrorExample = {
  code: 'THING.IN_USE',
  message: 'The thing is still in use.',
  details: { holders: 1 },
};

describe('errorExampleOf', () => {
  it('reads the code, message and details an ApiException answers with', () => {
    const exception = new ApiException(HttpStatus.CONFLICT, { ...IN_USE, details: { holders: 1 } });

    expect(errorExampleOf(exception)).toEqual(IN_USE);
  });

  it('leaves details out when the exception has none', () => {
    expect(errorExampleOf(new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND))).toEqual(NOT_FOUND);
  });

  it.each([
    ['a plain error', new Error('boom')],
    ['an HttpException without a code', new NotFoundException()],
    ['a mapper that passed the error on unchanged', { code: 'THING.NOT_FOUND', message: 'x' }],
  ])('refuses %s, so an example the runtime cannot answer is never published', (_, value) => {
    expect(() => errorExampleOf(value)).toThrow(/ApiException/);
  });
});

describe('toNamedErrorExamples', () => {
  it('names each example by its code and shows the full error envelope', () => {
    expect(toNamedErrorExamples([NOT_FOUND, IN_USE])).toEqual({
      'THING.NOT_FOUND': {
        summary: 'The thing does not exist.',
        value: {
          success: false,
          error: { code: 'THING.NOT_FOUND', message: 'The thing does not exist.', requestId: EXAMPLE_REQUEST_ID },
        },
      },
      'THING.IN_USE': {
        summary: 'The thing is still in use.',
        value: {
          success: false,
          error: {
            code: 'THING.IN_USE',
            message: 'The thing is still in use.',
            details: { holders: 1 },
            requestId: EXAMPLE_REQUEST_ID,
          },
        },
      },
    });
  });

  it('produces values the error envelope schema accepts', () => {
    for (const { value } of Object.values(toNamedErrorExamples([NOT_FOUND, IN_USE]))) {
      expect(errorEnvelopeSchema.safeParse(value).success).toBe(true);
    }
  });

  it('refuses the same code twice in one response', () => {
    expect(() => toNamedErrorExamples([NOT_FOUND, { ...NOT_FOUND }])).toThrow(/THING\.NOT_FOUND/);
  });

  it('copies, so a later change to a shared example cannot reach a published one', () => {
    const shared = { code: 'THING.IN_USE', message: 'The thing is still in use.', details: { holders: 1 } };
    const named = toNamedErrorExamples([shared]);
    shared.details.holders = 2;

    expect(named['THING.IN_USE'].value.error.details).toEqual({ holders: 1 });
  });
});

describe('withErrorExamples', () => {
  const ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };

  it('adds the examples a response does not show yet, after its own', () => {
    const own = {
      description: 'own',
      content: { 'application/json': { schema: ENVELOPE, examples: toNamedErrorExamples([NOT_FOUND]) } },
    };

    const result = withErrorExamples(own, [IN_USE, NOT_FOUND]);

    expect(Object.keys(result.content['application/json'].examples ?? {})).toEqual(['THING.NOT_FOUND', 'THING.IN_USE']);
    expect(result.description).toBe('own');
  });

  it('gives a response without examples its first ones and keeps its schema', () => {
    const result = withErrorExamples({ description: 'd', content: { 'application/json': { schema: ENVELOPE } } }, [
      NOT_FOUND,
    ]);

    expect(result.content['application/json']).toEqual({
      schema: ENVELOPE,
      examples: toNamedErrorExamples([NOT_FOUND]),
    });
  });

  it('does not modify the response it is given', () => {
    const input = { description: 'd', content: { 'application/json': { schema: ENVELOPE } } };
    const snapshot = JSON.stringify(input);

    withErrorExamples(input, [NOT_FOUND]);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
