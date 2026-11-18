import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { DeviceCollectorKindName } from '../tokens/device-credential-verifier.port';

export const AUTHENTICATED_DEVICE = Symbol('AUTHENTICATED_DEVICE');

/**
 * Who is calling a device route: the credential, and nothing of the machine, the registration or the person. Those are read under
 * a lock by the use case that needs them, so a request cannot act on what the guard saw a moment before.
 */
export interface CurrentDeviceCredential {
  credentialId: string;
  collectorKind: DeviceCollectorKindName;
}

type DeviceRequest = Request & { [AUTHENTICATED_DEVICE]?: CurrentDeviceCredential };

export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentDeviceCredential => {
    const device = context.switchToHttp().getRequest<DeviceRequest>()[AUTHENTICATED_DEVICE];

    if (!device) {
      throw new Error('Authenticated device is unavailable');
    }

    return device;
  },
);
