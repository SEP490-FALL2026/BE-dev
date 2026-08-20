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
});
