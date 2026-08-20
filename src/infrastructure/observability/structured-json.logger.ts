import { LoggerService } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

type LogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'verbose' | 'warn';

export class StructuredJsonLogger implements LoggerService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly service = 'software-license-api',
  ) {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, _trace?: string, context?: string): void {
    this.write('error', message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(level: LogLevel, value: unknown, context?: string): void {
    const message = value instanceof Error ? value.message : String(value);
    const sanitized = message
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\b(password|secret|token|api[_-]?key|authorization)\b\s*[:=]\s*[^,\s}]+/gi, '$1=[REDACTED]')
      .split('')
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('')
      .slice(0, 2_000);
    const requestId = this.requestContext.getRequestId();
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service.replace(/[^\w.-]/g, '').slice(0, 120),
      context: (context ?? 'Application').replace(/[^\w.:/-]/g, '').slice(0, 120),
      message: sanitized,
      ...(requestId ? { requestId } : {}),
    };
    const destination = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    destination.write(`${JSON.stringify(entry)}\n`);
  }
}
