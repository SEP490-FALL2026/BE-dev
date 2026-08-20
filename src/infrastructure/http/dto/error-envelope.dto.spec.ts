import { ERROR_CODE_PATTERN, errorEnvelopeSchema } from './error-envelope.dto';

describe('error envelope contract', () => {
  it('exports the canonical error-code pattern', () => {
    expect(ERROR_CODE_PATTERN.test('VALIDATION_ERROR')).toBe(true);
    expect(ERROR_CODE_PATTERN.test('LICENSES.SEAT_EXHAUSTED')).toBe(true);
    expect(ERROR_CODE_PATTERN.test('lowercase')).toBe(false);
    expect(ERROR_CODE_PATTERN.test('1_LEADING_DIGIT')).toBe(false);
  });

  it('accepts the envelope the filter produces', () => {
    const envelope = {
      success: false as const,
      error: {
        code: 'HTTP_NOT_FOUND',
        message: 'Resource was not found.',
        requestId: 'request-123',
      },
    };

    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });
});
