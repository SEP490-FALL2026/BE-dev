import { Logger } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { StructuredJsonLogger } from './structured-json.logger';

describe('StructuredJsonLogger', () => {
  describe('terminal output', () => {
    const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const stderrTty = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

    beforeEach(() => {
      const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development', TERM: 'xterm' };
      delete environment.NO_COLOR;
      jest.replaceProperty(process, 'env', environment);
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      if (stdoutTty) Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
      else Reflect.deleteProperty(process.stdout, 'isTTY');
      if (stderrTty) Object.defineProperty(process.stderr, 'isTTY', stderrTty);
      else Reflect.deleteProperty(process.stderr, 'isTTY');
    });

    it.each(['log', 'warn', 'error', 'fatal', 'debug', 'verbose'] as const)(
      'makes %s readable with color on a development terminal',
      (method) => {
        const destination = method === 'error' || method === 'fatal' ? process.stderr : process.stdout;
        const write = jest.spyOn(destination, 'write').mockReturnValue(true);
        const logger = new StructuredJsonLogger(new RequestContextService());

        logger[method]('Server ready');

        const output = String(write.mock.calls[0][0]);
        expect(output).toContain('\u001b[');
        expect(output).toContain(method === 'log' ? 'INFO' : method.toUpperCase());
        expect(output).toContain('[Application]');
        expect(output).toContain('Server ready');
        expect(() => JSON.parse(output) as unknown).toThrow();
      },
    );

    it('keeps request correlation and secret redaction in terminal messages and stacks', () => {
      const context = new RequestContextService();
      const logger = new StructuredJsonLogger(context);
      const write = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

      context.run('request-123', () => logger.error('password=hunter2', 'at fetch (Bearer signed-secret)'));

      const output = String(write.mock.calls[0][0]);
      expect(output).toContain('request-123');
      expect(output).toContain('at fetch');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('hunter2');
      expect(output).not.toContain('signed-secret');
    });

    it.each(['NO_COLOR', 'TERM'] as const)('respects %s without losing readable terminal output', (variable) => {
      process.env[variable] = variable === 'TERM' ? 'dumb' : '';
      const write = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
      new StructuredJsonLogger(new RequestContextService()).log('Server ready');

      const output = String(write.mock.calls[0][0]);
      expect(output).not.toContain('\u001b');
      expect(output).toContain('INFO');
      expect(output).toContain('[Application]');
    });

    it('keeps production terminal logs as plain JSON', () => {
      process.env.NODE_ENV = 'production';
      const write = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
      new StructuredJsonLogger(new RequestContextService()).log('Server ready');

      const output = String(write.mock.calls[0][0]);
      expect(output).not.toContain('\u001b');
      expect(JSON.parse(output)).toMatchObject({ level: 'info', message: 'Server ready' });
    });

    it.each(['log', 'error'] as const)('keeps redirected %s output as plain JSON', (method) => {
      const destination = method === 'error' ? process.stderr : process.stdout;
      Object.defineProperty(destination, 'isTTY', { configurable: true, value: false });
      const write = jest.spyOn(destination, 'write').mockReturnValue(true);
      new StructuredJsonLogger(new RequestContextService())[method]('Server ready');

      const output = String(write.mock.calls[0][0]);
      expect(output).not.toContain('\u001b');
      expect(JSON.parse(output)).toMatchObject({ message: 'Server ready' });
    });
  });

  it('correlates and redacts security-sensitive values', () => {
    const context = new RequestContextService();
    const logger = new StructuredJsonLogger(context);
    const write = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

    context.run('request-123', () => {
      logger.log('Authorization: Bearer signed-secret password=hunter2');
    });

    const output = String(write.mock.calls[0][0]);
    expect(output).toContain('request-123');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('signed-secret');
    expect(output).not.toContain('hunter2');
    write.mockRestore();
  });

  it('keeps a sanitized stack trace on error logs', () => {
    const logger = new StructuredJsonLogger(new RequestContextService());
    const write = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

    logger.error('Boom', 'Error: Boom\n    at handler (/app/src/main.ts:10:5)');

    const entry = JSON.parse(String(write.mock.calls[0][0])) as { stack?: string };
    expect(entry.stack).toContain('at handler');
    write.mockRestore();
  });

  it('redacts secrets inside the stack trace', () => {
    const logger = new StructuredJsonLogger(new RequestContextService());
    const write = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

    logger.error(new Error('Upstream rejected the call'), 'at fetch (Bearer signed-secret)');

    const entry = JSON.parse(String(write.mock.calls[0][0])) as { stack?: string };
    expect(entry.stack).toContain('[REDACTED]');
    expect(entry.stack).not.toContain('signed-secret');
    write.mockRestore();
  });

  it('keeps the Nest logger context on fatal instead of storing it as a stack', () => {
    // Nest pads `error` with a placeholder trace before appending the context but does
    // not pad `fatal`. A `fatal(message, trace, context)` signature therefore captures
    // the context into the stack field. This pins the difference.
    Logger.overrideLogger(new StructuredJsonLogger(new RequestContextService()));
    const write = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

    new Logger('LicenseAssignment').fatal('Shutting down');

    const entry = JSON.parse(String(write.mock.calls[0][0])) as { context: string; stack?: string };
    write.mockRestore();
    Logger.overrideLogger(false);

    expect(entry).toMatchObject({ context: 'LicenseAssignment' });
    expect(entry.stack).toBeUndefined();
  });
});
