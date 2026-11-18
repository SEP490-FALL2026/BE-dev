import { extractBearerToken } from './bearer-token';

describe('extractBearerToken', () => {
  it('extracts a bearer access token', () => {
    expect(extractBearerToken('Bearer signed-token')).toBe('signed-token');
  });

  // The authentication scheme is case-insensitive (RFC 9110 §11.1); the token is not.
  it.each(['bearer', 'BEARER', 'BeArEr'])('accepts the scheme written %s and keeps the token exactly', (scheme) => {
    expect(extractBearerToken(`${scheme} Signed.Token-_~+/=`)).toBe('Signed.Token-_~+/=');
  });

  it.each([
    undefined,
    '',
    'Basic abc',
    'Token abc',
    'Bearer',
    'Bearer ',
    'Bearertoken',
    'Bearer  token with spaces',
    'Bearer  token',
    'Bearer token extra',
    'Bearer\ttoken',
    'Bearer\ntoken',
    ' Bearer token',
    'Bearer token ',
    'bearer token',
  ])('rejects an invalid authorization header: %j', (header) => {
    expect(extractBearerToken(header)).toBeNull();
  });
});
