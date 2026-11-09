import { HttpStatus } from '@nestjs/common';

// Widened to `number` on purpose: `HttpException.getStatus()` returns a plain number, and
// comparing it against enum members directly trips @typescript-eslint/no-unsafe-enum-comparison.
const SERVER_ERROR: number = HttpStatus.INTERNAL_SERVER_ERROR;
const NOT_FOUND: number = HttpStatus.NOT_FOUND;
const UNAUTHORIZED: number = HttpStatus.UNAUTHORIZED;
const FORBIDDEN: number = HttpStatus.FORBIDDEN;

/**
 * The code and message of an error that carries no deliberate code of its own: a refusal of the throttler or a request
 * parser, an HttpException thrown without a body, or an unexpected server fault. The filter answers with exactly this,
 * and the OpenAPI document shows it for the answers that come from there.
 */
export function fallbackErrorFor(status: number): { code: string; message: string } {
  return { code: codeForStatus(status), message: safeMessageForStatus(status) };
}

function codeForStatus(status: number): string {
  // Every server fault answers with one code. The HTTP_-prefixed form is a mechanical
  // fallback for client errors that carry no deliberate code of their own; a 5xx is
  // never something the caller can act on differently, so it gets a single stable code.
  if (status >= SERVER_ERROR) {
    return 'INTERNAL_SERVER_ERROR';
  }

  const name = HttpStatus[status];
  return typeof name === 'string' ? `HTTP_${name}` : 'HTTP_ERROR';
}

function safeMessageForStatus(status: number): string {
  if (status === NOT_FOUND) return 'Resource was not found.';
  if (status === UNAUTHORIZED) return 'Authentication is required.';
  if (status === FORBIDDEN) return 'Access is forbidden.';
  if (status >= SERVER_ERROR) return 'An unexpected error occurred.';
  return 'The request could not be processed.';
}
