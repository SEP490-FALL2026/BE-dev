import { Logger } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { StructuredJsonLogger } from './structured-json.logger';

describe('StructuredJsonLogger', () => {
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
