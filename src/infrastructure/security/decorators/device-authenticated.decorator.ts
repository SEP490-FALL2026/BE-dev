import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { DeviceCollectorKindName } from '../tokens/device-credential-verifier.port';

export const IS_DEVICE_AUTHENTICATED_METADATA = Symbol('IS_DEVICE_AUTHENTICATED_METADATA');

export interface DeviceAuthenticatedOptions {
  /** The only kind of tool the route accepts; any other kind is a 403 before the body is read. Any kind when absent. */
  collectorKind?: DeviceCollectorKindName;
}

/** Requests per credential per hour; the throttle counts a device by its credential id, not by address. */
export const DEVICE_REQUESTS_PER_HOUR = 60;

/**
 * The route is called by a collector with the credential it enrolled for, never by a person: a user token is refused here and a device
 * credential is refused on every other route. It is a fourth access declaration — a route declares exactly one — and it documents
 * the `deviceCredential` bearer scheme in OpenAPI.
 */
export const DeviceAuthenticated = (options: DeviceAuthenticatedOptions = {}): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(IS_DEVICE_AUTHENTICATED_METADATA, options),
    ApiBearerAuth('deviceCredential'),
    Throttle({ default: { limit: DEVICE_REQUESTS_PER_HOUR, ttl: 3_600_000 } }),
  );
