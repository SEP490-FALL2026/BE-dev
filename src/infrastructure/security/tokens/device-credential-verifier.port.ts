export const DEVICE_CREDENTIAL_VERIFIER = Symbol('DEVICE_CREDENTIAL_VERIFIER');

/** The kind of tool a credential was issued to; a route may accept one kind only. */
export type DeviceCollectorKindName = 'AI_COLLECTOR' | 'BROWSER_EXTENSION';

/**
 * What the verifier says of a token. `INVALID` is a token that is not a credential of this system (malformed, unknown, or a secret
 * that does not match); only a token whose secret matched can be `REVOKED` or `EXPIRED`, so a guess learns nothing of a credential.
 */
export type DeviceCredentialVerdict =
  | { status: 'OK'; credentialId: string; collectorKind: DeviceCollectorKindName }
  | { status: 'INVALID' }
  | { status: 'REVOKED' }
  | { status: 'EXPIRED' };

/**
 * Verifies a device credential on every request. Implemented by the module that keeps credentials and bound by the application module,
 * so infrastructure never depends on a business module. When the database cannot answer it throws `TokenVerificationUnavailableError`
 * (a 503): a credential that cannot be checked is never reported as bad, because the tool drops a credential it is told is bad.
 */
export interface DeviceCredentialVerifierPort {
  verify(token: string): Promise<DeviceCredentialVerdict>;
}

/** The stand-in of an application that carries no device credentials: every token is invalid. */
export const REJECT_EVERY_DEVICE_CREDENTIAL: DeviceCredentialVerifierPort = {
  verify: () => Promise.resolve({ status: 'INVALID' }),
};
