import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app/app.module';
import { configureApplication } from '../../src/app/configure-application';
import {
  ACCESS_TOKEN_VERIFIER,
  AccessTokenVerifierPort,
  AuthenticatedPrincipal,
  InvalidAccessTokenError,
  TokenVerificationUnavailableError,
} from '../../src/infrastructure/security/tokens/access-token-verifier.port';

/**
 * HTTP contract harness (test/http): one Nest application per spec file, built in `beforeAll`.
 *
 * The caller's identity travels in the bearer token itself, so one application serves every role a file tries.
 * Earlier specs rebuilt the whole `AppModule` for each test case because the identity was baked into a mocked
 * verifier; that compile, repeated hundreds of times, was the main cost of the suite.
 */
const PREFIX = 'test-principal.';

/** A token the test verifier answers as "authentication is unavailable" (503), like a database outage. */
export const UNAVAILABLE_TOKEN = 'test-unavailable';

/** `Authorization` header value that authenticates as `principal`. */
export function bearer(principal: AuthenticatedPrincipal): string {
  return `Bearer ${PREFIX}${Buffer.from(JSON.stringify(principal)).toString('base64url')}`;
}

/** A principal with the given direct and derived roles; ids default to fixed values. */
export function principal(
  directRoles: readonly string[],
  derivedRoles: readonly string[] = [],
  ids: Partial<Pick<AuthenticatedPrincipal, 'subject' | 'appUserId' | 'sessionId' | 'employeeId'>> = {},
): AuthenticatedPrincipal {
  return {
    subject: 'u1',
    appUserId: 'u1',
    sessionId: 's1',
    employeeId: 'e1',
    ...ids,
    directRoles,
    derivedRoles,
    roles: [...directRoles, ...derivedRoles],
  };
}

/** Reads the principal back from a token made by `bearer`; any other token is invalid (401). */
export class TokenAsPrincipalVerifier implements AccessTokenVerifierPort {
  verify(token: string): Promise<AuthenticatedPrincipal> {
    if (token === UNAVAILABLE_TOKEN) {
      return Promise.reject(new TokenVerificationUnavailableError('test: authentication unavailable'));
    }
    if (!token.startsWith(PREFIX)) {
      return Promise.reject(new InvalidAccessTokenError());
    }
    try {
      return Promise.resolve(
        JSON.parse(Buffer.from(token.slice(PREFIX.length), 'base64url').toString('utf8')) as AuthenticatedPrincipal,
      );
    } catch {
      return Promise.reject(new InvalidAccessTokenError());
    }
  }
}

export interface ProviderOverride {
  token: unknown;
  useValue: unknown;
}

export interface HttpContractAppOptions {
  /** Providers replaced in the application, e.g. a repository whose answer the file controls. */
  overrides?: readonly ProviderOverride[];
  /** Mount Swagger/OpenAPI routes (only the OpenAPI specs need them). */
  mountDocs?: boolean;
}

/** Builds the real HTTP pipeline (guards, pipes, filters, serializers) once; call from `beforeAll`. */
export async function createHttpContractApp(options: HttpContractAppOptions = {}): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ACCESS_TOKEN_VERIFIER)
    .useValue(new TokenAsPrincipalVerifier());
  for (const override of options.overrides ?? []) {
    builder = builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const app = (await builder.compile()).createNestApplication<INestApplication<App>>();
  configureApplication(app, { mountDocs: options.mountDocs ?? false });
  await app.init();
  return app;
}
