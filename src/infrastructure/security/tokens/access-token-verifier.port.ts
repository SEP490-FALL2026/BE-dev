export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

export interface ExternalIdentity {
  issuer: string;
  subject: string;
  email: string | null;
}

export interface AccessTokenVerifierPort {
  verify(token: string): Promise<ExternalIdentity>;
}
