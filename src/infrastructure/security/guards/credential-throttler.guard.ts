import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_DEVICE_AUTHENTICATED_METADATA } from '../decorators/device-authenticated.decorator';
import { extractBearerToken } from '../tokens/bearer-token';
import { parseDeviceToken } from '../tokens/device-token';

/**
 * The global rate limit before anyone is authenticated. Everyone is counted by address, so a forged token on any route (the password
 * reset included) never moves a caller out of the bucket of their address. On a `@DeviceAuthenticated` route the credential id the
 * caller names is added to the address — `<ip>|<id>` — so a collector's own address has its own bucket and a stranger who knows an id
 * can only fill the bucket of their own address, never the collector's. The id is not trusted here; the bucket of the credential itself,
 * `device:<id>`, is counted by `DeviceAuthenticationGuard` once the secret has been checked.
 */
@Injectable()
export class CredentialThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Record<string, unknown>, context?: ExecutionContext): Promise<string> {
    const address = typeof request.ip === 'string' ? request.ip : '';
    if (
      !context ||
      !this.reflector.getAllAndOverride(IS_DEVICE_AUTHENTICATED_METADATA, [context.getHandler(), context.getClass()])
    ) {
      return Promise.resolve(address);
    }
    const headers = request.headers as Record<string, string | undefined> | undefined;
    const token = extractBearerToken(headers?.authorization);
    const device = token ? parseDeviceToken(token) : null;

    return Promise.resolve(device ? `${address}|${device.credentialId}` : address);
  }
}
