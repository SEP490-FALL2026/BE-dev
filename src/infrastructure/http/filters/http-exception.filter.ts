import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodSerializationException } from 'nestjs-zod';
import { RequestContextService } from '../../observability/request-context.service';
import { resolveRequestId } from '../../observability/request-id';
import { ERROR_CODE_PATTERN, type ErrorEnvelope } from '../dto/error-envelope.dto';
import { fallbackErrorFor } from './fallback-error';
import { fromRequestParserError } from './request-parser-errors';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    // Fallback for a failure raised before RequestIdMiddleware ran. It has no access to the
    // proxy configuration, so it never believes the inbound header.
    const requestId =
      this.requestContext.getRequestId() ?? resolveRequestId(request.header('x-request-id'), { trustInbound: false });
    // A refusal of a request parser (body too large, a multipart form that breaks its limits) is the client's error.
    const handled = fromRequestParserError(exception) ?? exception;
    const status = handled instanceof HttpException ? handled.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.createEnvelope(handled, status, requestId);

    // A client that left (request.aborted) has no socket to answer on: classify, but never write to it.
    if (this.clientIsGone(response)) return;
    response.setHeader('x-request-id', requestId).status(status).json(body);
  }

  private clientIsGone(response: Response): boolean {
    return response.headersSent || response.writableEnded || response.destroyed || response.socket?.destroyed === true;
  }

  private createEnvelope(exception: unknown, status: number, requestId: string): ErrorEnvelope {
    if (!(exception instanceof HttpException)) {
      this.logUnexpected(exception, requestId);
      return {
        success: false,
        error: { ...fallbackErrorFor(HttpStatus.INTERNAL_SERVER_ERROR), requestId },
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
        ERROR_CODE_PATTERN.test(candidate.code) &&
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

    return fallbackErrorFor(status);
  }

  private asDetails(value: unknown): Readonly<Record<string, unknown>> | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Readonly<Record<string, unknown>>;
  }

  private logUnexpected(exception: unknown, requestId: string): void {
    const summary =
      exception instanceof Error ? `${exception.name}: ${exception.message}` : 'A non-Error value was thrown';
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(`[requestId=${requestId}] ${summary}`, stack);
  }
}
