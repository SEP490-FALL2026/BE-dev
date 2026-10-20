import { EnvironmentValidationError } from '../config/env-schema';
import { CLI_FAILURE_EXIT_CODE, isEnvironmentValidationError, quietCliLogger, writeCliFailure } from './cli-runtime';

describe('CLI runtime (ROOT.1)', () => {
  let written: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    written = [];
    spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
  });

  afterEach(() => spy.mockRestore());

  it('writes a failure as one line to stderr and returns exit code 1', () => {
    expect(writeCliFailure('Refused (X). Nothing was changed.')).toBe(1);
    expect(CLI_FAILURE_EXIT_CODE).toBe(1);
    expect(written).toEqual(['Refused (X). Nothing was changed.\n']);
  });

  it('keeps Nest log and error output off the terminal, and passes warnings through as one line', () => {
    quietCliLogger.log('bootstrapped');
    quietCliLogger.error('connection to postgresql://user:s3cr3t@db failed', 'stack at x');
    quietCliLogger.warn('slow start');
    quietCliLogger.warn({ structured: true });

    expect(written).toEqual(['warning: slow start\n', 'warning: unexpected warning\n']);
  });

  it('recognises an environment validation failure by its class only, never by its name string', () => {
    const impostor = new Error('Environment validation failed: x');
    impostor.name = 'EnvironmentValidationError';

    expect(isEnvironmentValidationError(new EnvironmentValidationError('Environment validation failed: x'))).toBe(true);
    expect(isEnvironmentValidationError(impostor)).toBe(false);
    expect(isEnvironmentValidationError({ name: 'EnvironmentValidationError', message: 'x' })).toBe(false);
    expect(isEnvironmentValidationError(undefined)).toBe(false);
  });
});
