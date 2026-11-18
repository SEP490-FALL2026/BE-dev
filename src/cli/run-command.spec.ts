import { Module } from '@nestjs/common';
import { EnvironmentValidationError } from '../infrastructure/config/env-schema';
import {
  CLI_FAILURE_EXIT_CODE,
  defineCommand,
  isEnvironmentValidationError,
  quietCliLogger,
  runInNestContext,
  writeCliFailure,
} from './run-command';

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

class SampleArgumentError extends Error {}
type SampleArguments = { help: true } | { help: false; word: string };

describe('defineCommand (Task 1b.2: the skeleton every command shares)', () => {
  let stdout: string[];
  let stderr: string[];
  const spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    spies.push(
      jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      }),
      jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stderr.push(String(chunk));
        return true;
      }),
    );
  });

  afterEach(() => spies.splice(0).forEach((spy) => spy.mockRestore()));

  const sample = (execute: (args: { help: false; word: string }) => Promise<number>) =>
    defineCommand<SampleArguments>({
      usage: 'Usage: sample <word>',
      parse: (argv) => {
        if (argv[0] === '--help') return { help: true };
        if (argv[0] === 'boom') throw new TypeError('not an argument error');
        if (argv.length !== 1) throw new SampleArgumentError('Name one word.');
        return { help: false, word: argv[0] };
      },
      argumentError: SampleArgumentError,
      crashed: (error) => `The sample failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      execute,
    });

  it('prints the usage for --help and exits 0 without running the command', async () => {
    const execute = jest.fn();

    await expect(sample(execute).run(['--help'])).resolves.toBe(0);
    expect(stdout).toEqual(['Usage: sample <word>\n']);
    expect(stderr).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('prints an argument error with the usage on stderr and exits 1 without running the command', async () => {
    const execute = jest.fn();

    await expect(sample(execute).run([])).resolves.toBe(1);
    expect(stderr).toEqual(['Name one word.\n\nUsage: sample <word>\n']);
    expect(stdout).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs the command on its parsed arguments and returns its exit code', async () => {
    await expect(sample(({ word }) => Promise.resolve(word === 'two' ? 2 : 0)).run(['two'])).resolves.toBe(2);
  });

  it('reports any other throw, from parsing or from the command, by the crash line only, exit 1', async () => {
    await expect(sample(() => Promise.resolve(0)).run(['boom'])).resolves.toBe(1);
    await expect(
      sample(() => Promise.reject(new RangeError('postgresql://user:s3cr3t@db'))).run(['word']),
    ).resolves.toBe(1);

    expect(stderr).toEqual(['The sample failed: TypeError\n', 'The sample failed: RangeError\n']);
  });
});

@Module({})
class EmptyModule {}

describe('runInNestContext', () => {
  let stderr: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    stderr = [];
    spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => spy.mockRestore());

  it('runs the work in the application context of the graph and closes it', async () => {
    let closed = false;
    const code = await runInNestContext({
      graph: () => Promise.resolve(EmptyModule),
      work: (app) => {
        const close = app.close.bind(app);
        jest.spyOn(app, 'close').mockImplementation(() => {
          closed = true;
          return close();
        });
        return Promise.resolve(7);
      },
      failed: () => 99,
    });

    expect({ code, closed }).toEqual({ code: 7, closed: true });
  });

  it('prints an environment that does not validate as its message, exit 1, without asking the command', async () => {
    const failed = jest.fn(() => 99);
    const code = await runInNestContext({
      graph: () =>
        Promise.reject(new EnvironmentValidationError('Environment validation failed: "DATABASE_URL" is required')),
      work: () => Promise.resolve(0),
      failed,
    });

    expect(code).toBe(1);
    expect(stderr).toEqual(['Environment validation failed: "DATABASE_URL" is required\n']);
    expect(failed).not.toHaveBeenCalled();
  });

  it('hands any other failure to the command, which chooses what to print and the exit code', async () => {
    const failure = new Error('refused');
    const failed = jest.fn(() => 2);

    await expect(
      runInNestContext({
        graph: () => Promise.resolve(EmptyModule),
        work: () => Promise.reject(failure),
        failed,
      }),
    ).resolves.toBe(2);
    expect(failed).toHaveBeenCalledWith(failure);
  });
});
