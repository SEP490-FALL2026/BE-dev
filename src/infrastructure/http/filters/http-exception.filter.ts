import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodSerializationException } from 'nestjs-zod';
import { RequestContextService } from '../../observability/request-context.service';
import { resolveRequestId } from '../../observability/request-id';

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Readonly<Record<string, unknown>>;
    requestId: string;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = this.requestContext.getRequestId() ?? resolveRequestId(request.header('x-request-id'));
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.createEnvelope(exception, status, requestId);

    response.setHeader('x-request-id', requestId).status(status).json(body);
  }

  private createEnvelope(exception: unknown, status: number, requestId: string): ErrorEnvelope {
    if (!(exception instanceof HttpException)) {
      this.logUnexpected(exception, requestId);
      return {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred.',
          requestId,
        },
      };
    }

    if (exception instanceof ZodSerializationException) {
      this.logUnexpected(exception, requestId);
    }

    const controlled = this.extractControlledError(exception, status);

    return {
      success: false,
      error: {
        code: controlled.code,
        message: controlled.message,
        ...(controlled.details === undefined ? {} : { details: controlled.details }),
        requestId,
      },
    };
  }

  private extractControlledError(
    exception: HttpException,
    status: number,
  ): { code: string; message: string; details?: Readonly<Record<string, unknown>> } {
    const response = exception.getResponse();

    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const candidate = response as Record<string, unknown>;
      if (
        typeof candidate.code === 'string' &&
        /^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)*$/.test(candidate.code) &&
        typeof candidate.message === 'string'
      ) {
        const details = this.asDetails(candidate.details);
        return {
          code: candidate.code,
          message: candidate.message,
          ...(details === undefined ? {} : { details }),
        };
      }
    }

    return {
      code: this.codeForStatus(status),
      message: this.safeMessageForStatus(status),
    };
  }

  private asDetails(value: unknown): Readonly<Record<string, unknown>> | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Readonly<Record<string, unknown>>;
  }

  private codeForStatus(status: number): string {
    const name = HttpStatus[status];
    return typeof name === 'string' ? `HTTP_${name}` : 'HTTP_ERROR';
  }

  private safeMessageForStatus(status: number): string {
    if (status === 404) return 'Resource was not found.';
    if (status === 401) return 'Authentication is required.';
    if (status === 403) return 'Access is forbidden.';
    if (status >= 500) return 'An unexpected error occurred.';
    return 'The request could not be processed.';
  }

  private logUnexpected(exception: unknown, requestId: string): void {
    const summary =
      exception instanceof Error ? `${exception.name}: ${exception.message}` : 'A non-Error value was thrown';
    this.logger.error(`[requestId=${requestId}] ${summary}`);
  }
}
