import { Controller, ExecutionContext, Get, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService, ThrottlerStorage } from '@nestjs/throttler';
import { ApiException } from '../../http/errors/api.exception';
import { AuthenticatedOnly } from '../decorators/access.decorators';
import { DeviceAuthenticated } from '../decorators/device-authenticated.decorator';
import { AUTHENTICATED_DEVICE } from '../models/current-device';
import { TokenVerificationUnavailableError } from '../tokens/access-token-verifier.port';
import type { DeviceCredentialVerdict, DeviceCredentialVerifierPort } from '../tokens/device-credential-verifier.port';
import { formatDeviceToken } from '../tokens/device-token';
import { AccessDeclarationGuard } from './access-declaration.guard';
import { AuthenticationGuard } from './authentication.guard';
import { CredentialThrottlerGuard } from './credential-throttler.guard';
import { DeviceAuthenticationGuard } from './device-authentication.guard';

@Controller('probe')
class ProbeController {
  @Get() @DeviceAuthenticated() anyKind(): void {}
  @Get() @DeviceAuthenticated({ collectorKind: 'AI_COLLECTOR' }) aiOnly(): void {}
  @Get() @AuthenticatedOnly() person(): void {}
  @Get() @AuthenticatedOnly() @DeviceAuthenticated() both(): void {}
}

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const TOKEN = formatDeviceToken(ID, 'a'.repeat(43));

function contextOf(handlerName: string, authorization?: string) {
  const request: Record<string | symbol, unknown> = {
    header: (name: string) => (name === 'authorization' ? authorization : undefined),
  };
  const context = {
    getClass: () => ProbeController,
    getHandler: () => (ProbeController.prototype as unknown as Record<string, () => void>)[handlerName],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

const verifierOf = (verdict: DeviceCredentialVerdict | Error): DeviceCredentialVerifierPort => ({
  verify: () => (verdict instanceof Error ? Promise.reject(verdict) : Promise.resolve(verdict)),
});

const guardOf = (verifier: DeviceCredentialVerifierPort, storage: ThrottlerStorage = new ThrottlerStorageService()) =>
  new DeviceAuthenticationGuard(new Reflector(), verifier, new Logger(), storage);

const refusal = async (promise: Promise<unknown>): Promise<{ status: number; code: string }> => {
  try {
    await promise;
  } catch (error) {
    const response = (error as ApiException).getResponse() as { code: string };

    return { status: (error as ApiException).getStatus(), code: response.code };
  }
  throw new Error('The guard let the request in');
};

describe('DeviceAuthenticationGuard', () => {
  const ok: DeviceCredentialVerdict = { status: 'OK', credentialId: ID, collectorKind: 'AI_COLLECTOR' };

  it('lets a request through and names the credential when the verifier says OK', async () => {
    const { context, request } = contextOf('anyKind', `Bearer ${TOKEN}`);

    await expect(guardOf(verifierOf(ok)).canActivate(context)).resolves.toBe(true);

    expect(request[AUTHENTICATED_DEVICE]).toEqual({ credentialId: ID, collectorKind: 'AI_COLLECTOR' });
  });

  it('does nothing on a route that is not a device route', async () => {
    await expect(guardOf(verifierOf(new Error('never asked'))).canActivate(contextOf('person').context)).resolves.toBe(
      true,
    );
  });

  it('refuses a request with no bearer token as an invalid credential', async () => {
    expect(await refusal(guardOf(verifierOf(ok)).canActivate(contextOf('anyKind').context))).toEqual({
      status: 401,
      code: 'DEVICE.CREDENTIAL_INVALID',
    });
  });

  it.each([
    ['INVALID', 'DEVICE.CREDENTIAL_INVALID'],
    ['REVOKED', 'DEVICE.CREDENTIAL_REVOKED'],
    ['EXPIRED', 'DEVICE.CREDENTIAL_EXPIRED'],
  ] as const)('answers 401 %s with its own code', async (status, code) => {
    const answer = await refusal(
      guardOf(verifierOf({ status })).canActivate(contextOf('anyKind', `Bearer ${TOKEN}`).context),
    );

    expect(answer).toEqual({ status: 401, code });
  });

  it('answers 403 when the credential was issued to another kind of collector than the route takes', async () => {
    const extension: DeviceCredentialVerdict = { status: 'OK', credentialId: ID, collectorKind: 'BROWSER_EXTENSION' };

    expect(
      await refusal(guardOf(verifierOf(extension)).canActivate(contextOf('aiOnly', `Bearer ${TOKEN}`).context)),
    ).toEqual({
      status: 403,
      code: 'DEVICE.WRONG_COLLECTOR_KIND',
    });
    await expect(guardOf(verifierOf(ok)).canActivate(contextOf('aiOnly', `Bearer ${TOKEN}`).context)).resolves.toBe(
      true,
    );
  });

  it('answers 503, never 401, when the database cannot say whether the credential is good', async () => {
    const answer = await refusal(
      guardOf(verifierOf(new TokenVerificationUnavailableError(new Error('down')))).canActivate(
        contextOf('anyKind', `Bearer ${TOKEN}`).context,
      ),
    );

    expect(answer).toEqual({ status: 503, code: 'TOKEN_VERIFICATION_UNAVAILABLE' });
  });

  it('lets a defect of the verifier surface as an error, not as a bad credential', async () => {
    await expect(
      guardOf(verifierOf(new Error('bug'))).canActivate(contextOf('anyKind', `Bearer ${TOKEN}`).context),
    ).rejects.toThrow('bug');
  });
});

describe('the other guards and a device route', () => {
  it('the user authentication guard lets a device route pass without asking for a user token', async () => {
    const guard = new AuthenticationGuard(
      new Reflector(),
      { verify: () => Promise.reject(new Error('never')) },
      new Logger(),
    );

    await expect(guard.canActivate(contextOf('anyKind', 'Bearer user-token').context)).resolves.toBe(true);
  });

  it('a route declares exactly one access: a person and a device on one route is refused', () => {
    const guard = new AccessDeclarationGuard(new Reflector());

    expect(guard.canActivate(contextOf('anyKind').context)).toBe(true);
    expect(() => guard.canActivate(contextOf('both').context)).toThrow();
  });
});

describe('the request limits of a device', () => {
  const okVerdict: DeviceCredentialVerdict = { status: 'OK', credentialId: ID, collectorKind: 'AI_COLLECTOR' };

  it('counts a credential only after its secret was checked: a bad token never fills the bucket of an id', async () => {
    const storage = new ThrottlerStorageService();
    const bad = guardOf(verifierOf({ status: 'INVALID' }), storage);
    for (let i = 0; i < 100; i += 1) {
      await refusal(bad.canActivate(contextOf('anyKind', `Bearer ${TOKEN}`).context));
    }
    // 100 forged requests for the id left the bucket of the real collector empty, so its first request is its first.
    const good = guardOf(verifierOf(okVerdict), storage);
    await expect(good.canActivate(contextOf('anyKind', `Bearer ${TOKEN}`).context)).resolves.toBe(true);
  });

  it('answers 429 to a verified credential past the limit of its route, and to no other credential', async () => {
    const storage = new ThrottlerStorageService();
    const good = guardOf(verifierOf(okVerdict), storage);
    for (let i = 0; i < 60; i += 1) await good.canActivate(contextOf('anyKind', `Bearer ${TOKEN}`).context);

    expect((await refusal(good.canActivate(contextOf('anyKind', `Bearer ${TOKEN}`).context))).status).toBe(429);
    const other = guardOf(verifierOf({ ...okVerdict, credentialId: '4f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }), storage);
    await expect(other.canActivate(contextOf('anyKind', `Bearer ${TOKEN}`).context)).resolves.toBe(true);
  });
});

describe('CredentialThrottlerGuard', () => {
  const guard = Object.create(CredentialThrottlerGuard.prototype) as { reflector: Reflector } & {
    getTracker: (r: Record<string, unknown>, c?: ExecutionContext) => Promise<string>;
  };
  guard.reflector = new Reflector();
  const tracker = (request: Record<string, unknown>, handler?: string) =>
    guard.getTracker(request, handler ? contextOf(handler).context : undefined);

  it('counts everything by address on a route that is not a device route, whatever token it carries', async () => {
    const forged = { ip: '10.0.0.1', headers: { authorization: `Bearer ${TOKEN}` } };

    expect(await tracker(forged, 'person')).toBe('10.0.0.1');
    expect(await tracker(forged)).toBe('10.0.0.1');
    expect(await tracker({ ip: '10.0.0.2', headers: {} }, 'person')).toBe('10.0.0.2');
  });

  it('adds the id a caller names to the address on a device route, so a stranger cannot fill the bucket of a collector', async () => {
    expect(await tracker({ ip: '10.0.0.1', headers: { authorization: `Bearer ${TOKEN}` } }, 'anyKind')).toBe(
      `10.0.0.1|${ID}`,
    );
    expect(await tracker({ ip: '10.0.0.9', headers: { authorization: `Bearer ${TOKEN}` } }, 'anyKind')).toBe(
      `10.0.0.9|${ID}`,
    );
    expect(await tracker({ ip: '10.0.0.1', headers: { authorization: 'Bearer not-a-device-token' } }, 'anyKind')).toBe(
      '10.0.0.1',
    );
  });
});
