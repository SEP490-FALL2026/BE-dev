import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable, Logger, LoggerService } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  DEVICE_CREDENTIAL_EXPIRED_ERROR,
  DEVICE_CREDENTIAL_INVALID_ERROR,
  DEVICE_CREDENTIAL_REVOKED_ERROR,
  DEVICE_WRONG_COLLECTOR_KIND_ERROR,
  TOKEN_VERIFICATION_UNAVAILABLE_ERROR,
} from '../../http/errors/access-errors';
import { ApiException } from '../../http/errors/api.exception';
import { describeForOperator } from '../../observability/operator-error';
import {
  DEVICE_REQUESTS_PER_HOUR,
  IS_DEVICE_AUTHENTICATED_METADATA,
  type DeviceAuthenticatedOptions,
} from '../decorators/device-authenticated.decorator';
import { AUTHENTICATED_DEVICE, type CurrentDeviceCredential } from '../models/current-device';
import { TokenVerificationUnavailableError } from '../tokens/access-token-verifier.port';
import { extractBearerToken } from '../tokens/bearer-token';
import {
  DEVICE_CREDENTIAL_VERIFIER,
  type DeviceCredentialVerdict,
  type DeviceCredentialVerifierPort,
} from '../tokens/device-credential-verifier.port';

const DEVICE_WINDOW_MS = 3_600_000;
/** Where `@Throttle({ default: { limit } })` keeps the limit of a route (the key `@nestjs/throttler` reads, not exported by it). */
const THROTTLER_DEFAULT_LIMIT_METADATA = 'THROTTLER:LIMITdefault';

type DeviceRequest = Request & { [AUTHENTICATED_DEVICE]?: CurrentDeviceCredential };

/**
 * Who is calling a `@DeviceAuthenticated()` route: the credential in the bearer header, checked against the database on every request.
 * Runs after the user authentication guard (which lets a device route through) and before the role check. Rejections are not logged,
 * for the reason the user token's are not: a bad token is normal and high-volume. A database that cannot answer is a 503, never a
 * 401, because the tool deletes a credential it is told is bad.
 */
@Injectable()
export class DeviceAuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DEVICE_CREDENTIAL_VERIFIER) private readonly verifier: DeviceCredentialVerifierPort,
    @Inject(Logger) private readonly logger: LoggerService,
    @Inject(ThrottlerStorage) private readonly throttle: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<DeviceAuthenticatedOptions | undefined>(
      IS_DEVICE_AUTHENTICATED_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const token = extractBearerToken(request.header('authorization'));
    if (!token) throw new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_INVALID_ERROR);

    const verdict = await this.verify(token);
    if (verdict.status === 'INVALID') throw new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_INVALID_ERROR);
    if (verdict.status === 'REVOKED') throw new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_REVOKED_ERROR);
    if (verdict.status === 'EXPIRED') throw new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_EXPIRED_ERROR);
    if (options.collectorKind && verdict.collectorKind !== options.collectorKind) {
      throw new ApiException(HttpStatus.FORBIDDEN, DEVICE_WRONG_COLLECTOR_KIND_ERROR);
    }
    await this.countCredential(context, verdict.credentialId);
    request[AUTHENTICATED_DEVICE] = { credentialId: verdict.credentialId, collectorKind: verdict.collectorKind };

    return true;
  }

  /**
   * The request limit of one credential, counted only for a credential whose secret was just checked: a stranger who knows an id has no
   * way into this bucket (the requests before authentication are counted by address). The limit is the one the route declares.
   */
  private async countCredential(context: ExecutionContext, credentialId: string): Promise<void> {
    const limit =
      this.reflector.getAllAndOverride<number | undefined>(THROTTLER_DEFAULT_LIMIT_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEVICE_REQUESTS_PER_HOUR;
    const record = await this.throttle.increment(
      `device:${credentialId}`,
      DEVICE_WINDOW_MS,
      limit,
      DEVICE_WINDOW_MS,
      'device',
    );
    if (record.isBlocked || record.totalHits > limit) throw new ThrottlerException();
  }

  private async verify(token: string): Promise<DeviceCredentialVerdict> {
    try {
      return await this.verifier.verify(token);
    } catch (error) {
      if (error instanceof TokenVerificationUnavailableError) {
        this.logger.error(
          'Device credential verification is unavailable',
          describeForOperator(error.reason, { stack: true }),
        );
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, TOKEN_VERIFICATION_UNAVAILABLE_ERROR);
      }
      // A defect of the verifier is a 500 with a log, not a credential that looks bad.
      throw error;
    }
  }
}
