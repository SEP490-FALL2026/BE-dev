import Joi from 'joi';

/** Thrown by every environment validator; the commands report it as one line, without a stack trace. */
export class EnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentValidationError';
  }
}

/**
 * Runs one Joi schema over the raw environment, converting types and reporting every problem at once. The message
 * names keys and rules, never a value: Joi quotes the key, not what was supplied.
 */
export function validateWithSchema(schema: Joi.ObjectSchema, input: Record<string, unknown>): unknown {
  const validation = schema.validate(input, {
    abortEarly: false,
    convert: true,
  }) as unknown as { error?: Error; value: unknown };

  if (validation.error) {
    throw new EnvironmentValidationError(`Environment validation failed: ${validation.error.message}`);
  }

  return validation.value;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
