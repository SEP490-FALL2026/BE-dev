import { ExecutionContext, HttpStatus, LoggerService } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../../http/errors/api.exception';
import { RequestContextService } from '../../observability/request-context.service';
import { StructuredJsonLogger } from '../../observability/structured-json.logger';
import { AUTHENTICATED_IDENTITY } from '../models/current-principal';
import {
  AccessTokenVerifierPort,
  InvalidAccessTokenError,
  TokenVerificationUnavailableError,
} from '../tokens/access-token-verifier.port';
import { AuthenticationGuard } from './authentication.guard';

const IDENTITY = { issuer: 'https://identity.example.com/realms/internal', subject: 'test-user-1', email: null };

interface LoggerDouble extends LoggerService {
  error: jest.Mock;
  log: jest.Mock;
  warn: jest.Mock;
  debug: jest.Mock;
  verbose: jest.Mock;
}

function loggerDouble(): LoggerDouble {
  return {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}

/**
 * `getHandler` and `getClass` must return real references: `Reflector.getAllAndOverride`
 * reads metadata from whatever they return and throws a TypeError on `undefined`.
 */
function contextFor(authorization?: string): { context: ExecutionContext; request: Record<symbol, unknown> } {
  const request: Record<symbol, unknown> & { header: (name: string) => string | undefined } = {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  };
  const handler = (): void => undefined;
  class ProbeController {}

  return {
    request,
    context: {
      getHandler: () => handler,
      getClass: () => ProbeController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

function guardWith(verify: jest.Mock, logger: LoggerService = loggerDouble()): AuthenticationGuard {
  const verifier: AccessTokenVerifierPort = { verify: verify as AccessTokenVerifierPort['verify'] };

  return new AuthenticationGuard(new Reflector(), verifier, logger);
}

function outage(): TokenVerificationUnavailableError {
  return new TokenVerificationUnavailableError(
    Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:8443'), { code: 'ECONNREFUSED' }),
  );
}

describe('AuthenticationGuard', () => {
  it('rejects a missing token without consulting the verifier', async () => {
    const verify = jest.fn();

    await expect(guardWith(verify).canActivate(contextFor(undefined).context)).rejects.toBeInstanceOf(ApiException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('attaches the verified identity to the request', async () => {
    const { context, request } = contextFor('Bearer good-token');

    await expect(guardWith(jest.fn().mockResolvedValue(IDENTITY)).canActivate(context)).resolves.toBe(true);
    expect(request[AUTHENTICATED_IDENTITY]).toEqual(IDENTITY);
  });

  it('answers 401 for an invalid token', async () => {
    const rejection = guardWith(jest.fn().mockRejectedValue(new InvalidAccessTokenError())).canActivate(
      contextFor('Bearer bad-token').context,
    );

    await expect(rejection).rejects.toBeInstanceOf(ApiException);
    await expect(rejection).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      response: { code: 'INVALID_ACCESS_TOKEN' },
    });
  });

  it('does not put the internal error text of an invalid token on the wire', async () => {
    const internal = new InvalidAccessTokenError('Access token is missing a stable external identity');

    await expect(
      guardWith(jest.fn().mockRejectedValue(internal)).canActivate(contextFor('Bearer bad-token').context),
    ).rejects.toMatchObject({ response: { message: 'The access token is invalid.' } });
  });

  it('does not log an invalid token, so a brute-force cannot flood the log', async () => {
    const logger = loggerDouble();

    await expect(
      guardWith(jest.fn().mockRejectedValue(new InvalidAccessTokenError()), logger).canActivate(
        contextFor('Bearer bad-token').context,
      ),
    ).rejects.toBeInstanceOf(ApiException);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('answers 503 when the authentication service is unreachable', async () => {
    const rejection = guardWith(jest.fn().mockRejectedValue(outage())).canActivate(
      contextFor('Bearer good-token').context,
    );

    await expect(rejection).rejects.toBeInstanceOf(ApiException);
    await expect(rejection).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: 'TOKEN_VERIFICATION_UNAVAILABLE' },
    });
  });

  it('does not describe the infrastructure to the caller', async () => {
    const rejection = guardWith(jest.fn().mockRejectedValue(outage())).canActivate(
      contextFor('Bearer good-token').context,
    );

    await expect(rejection).rejects.toBeInstanceOf(ApiException);
    await rejection.catch((error: ApiException) => {
      const wire = JSON.stringify(error.getResponse());
      expect(wire).not.toContain('10.0.0.5');
      expect(wire).not.toContain('ECONNREFUSED');
    });
  });

  it('logs the outage once, because it is the only signal an operator gets', async () => {
    const logger = loggerDouble();

    await expect(
      guardWith(jest.fn().mockRejectedValue(outage()), logger).canActivate(contextFor('Bearer good-token').context),
    ).rejects.toBeInstanceOf(ApiException);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('never logs the bearer token itself', async () => {
    const logger = loggerDouble();
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature-part';

    await expect(
      guardWith(jest.fn().mockRejectedValue(outage()), logger).canActivate(contextFor(`Bearer ${token}`).context),
    ).rejects.toBeInstanceOf(ApiException);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('eyJ');
  });

  it('re-throws an unclassified verifier failure instead of disguising it as a bad token', async () => {
    const defect = new TypeError('the verifier itself is broken');

    await expect(
      guardWith(jest.fn().mockRejectedValue(defect)).canActivate(contextFor('Bearer good-token').context),
    ).rejects.toBe(defect);
  });

  it('logs through the real application logger without crashing', async () => {
    // Regression guard. `LoggerService.error(message, trace)` types `trace` as a string and
    // StructuredJsonLogger runs string sanitisation over it. Passing an object throws inside
    // the logger, escapes canActivate, and silently converts this 503 into a 500 with nothing
    // logged — while a mocked logger keeps every other test in this file green.
    const written: string[] = [];
    const write = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
      written.push(String(chunk));
      return true;
    });
    const realLogger = new StructuredJsonLogger(new RequestContextService());

    const rejection = guardWith(jest.fn().mockRejectedValue(outage()), realLogger).canActivate(
      contextFor('Bearer good-token').context,
    );

    await expect(rejection).rejects.toBeInstanceOf(ApiException);
    await expect(rejection).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    write.mockRestore();

    expect(written).toHaveLength(1);
    const entry = JSON.parse(written[0]) as { level: string; message: string; stack?: string };
    expect(entry.level).toBe('error');
    expect(entry.stack).toContain('ECONNREFUSED');
    // The shared description of a failure: the kind and whether it can be retried, never the address in the message.
    expect(entry.stack).toContain('retryable=true');
    expect(entry.stack).not.toContain('10.0.0.5');
  });
});
