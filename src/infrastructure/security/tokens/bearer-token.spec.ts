import { extractBearerToken } from './bearer-token';

describe('extractBearerToken', () => {
  it('extracts a bearer access token', () => {
    expect(extractBearerToken('Bearer signed-token')).toBe('signed-token');
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer  token with spaces'])(
    'rejects an invalid authorization header: %s',
    (header) => {
      expect(extractBearerToken(header)).toBeNull();
    },
  );
});
