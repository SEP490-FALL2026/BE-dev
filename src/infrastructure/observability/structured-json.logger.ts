import { LoggerService } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

type LogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'verbose' | 'warn';

const MESSAGE_LIMIT = 2_000;
const STACK_LIMIT = 8_000;
const LEVEL_COLORS: Record<LogLevel, string> = {
  info: '32',
  warn: '33',
  error: '31',
  fatal: '1;31',
  debug: '34',
  verbose: '90',
};

export class StructuredJsonLogger implements LoggerService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly service = 'software-license-api',
  ) {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
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

  /**
   * Nest's Logger pads `error` with a placeholder trace before appending the context
   * (`logger.service.js`), but does NOT pad `fatal`. Giving `fatal` a `trace` parameter
   * therefore captures the context into the stack field. Keep the two signatures
   * different on purpose; `write` still derives a stack when `message` is an Error.
   */
  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(level: LogLevel, value: unknown, context?: string, trace?: string): void {
    const message = value instanceof Error ? value.message : String(value);
    const stack = trace ?? (value instanceof Error ? value.stack : undefined);
    const requestId = this.requestContext.getRequestId();
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service.replace(/[^\w.-]/g, '').slice(0, 120),
      context: (context ?? 'Application').replace(/[^\w.:/-]/g, '').slice(0, 120),
      message: this.sanitize(message, MESSAGE_LIMIT),
      ...(requestId ? { requestId } : {}),
      ...(stack ? { stack: this.sanitize(stack, STACK_LIMIT) } : {}),
    };
    const destination = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    if (destination.isTTY && process.env.NODE_ENV !== 'production') {
      const useColor = process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb';
      const paint = (text: string, color: string): string => (useColor ? `\u001b[${color}m${text}\u001b[0m` : text);
      const correlation = requestId ? ` ${paint(`requestId=${this.sanitize(requestId, 120)}`, '90')}` : '';
      const details = entry.stack ? `\n  ${paint(entry.stack, '90')}` : '';
      destination.write(
        `${paint(entry.timestamp, '90')} ${paint(level.toUpperCase().padEnd(7), LEVEL_COLORS[level])} ` +
          `${paint(`[${entry.service}]`, '90')} ${paint(`[${entry.context}]`, '36')} ` +
          `${paint(entry.message, LEVEL_COLORS[level])}${correlation}${details}\n`,
      );
      return;
    }
    destination.write(`${JSON.stringify(entry)}\n`);
  }

  private sanitize(value: string, limit: number): string {
    return value
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\b(password|secret|token|api[_-]?key|authorization)\b\s*[:=]\s*[^,\s}]+/gi, '$1=[REDACTED]')
      .split('')
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('')
      .slice(0, limit);
  }
}
