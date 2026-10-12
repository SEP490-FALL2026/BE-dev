import {
  AccessTokenVerifierPort,
  AuthenticatedPrincipal,
  AuthenticationNotConfiguredError,
} from './access-token-verifier.port';

/** Fail closed until the account/password + JWT user story supplies a real verifier. */
export class UnconfiguredTokenVerifier implements AccessTokenVerifierPort {
  verify(): Promise<AuthenticatedPrincipal> {
    return Promise.reject(new AuthenticationNotConfiguredError());
  }
}
