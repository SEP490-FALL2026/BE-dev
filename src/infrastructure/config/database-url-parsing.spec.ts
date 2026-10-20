/**
 * Characterization (Prompt 23, Phase 0): what the WHATWG URL parser of Node, which every host check here builds on,
 * makes of DATABASE_URL shapes. A check that reads the raw string instead (`includes('localhost')`) is fooled by
 * several of these; one that reads `hostname` is not.
 */
describe('Node URL parsing of DATABASE_URL hosts', () => {
  const host = (value: string) => new URL(value).hostname;

  it.each([
    ['postgresql://app:secret@localhost:5432/db', 'localhost'],
    // postgresql: is not a special scheme, so the host is not lowercased: a check must lowercase it itself.
    ['postgresql://app:secret@LOCALHOST/db', 'LOCALHOST'],
    ['postgresql://app:secret@127.0.0.1:5432/db', '127.0.0.1'],
    ['postgresql://app@127.1.2.3/db', '127.1.2.3'],
    ['postgresql://app:secret@[::1]:5432/db', '[::1]'],
    ['postgresql://app:secret@[0:0:0:0:0:0:0:1]/db', '[::1]'],
    ['postgresql://app:secret@postgres:5432/db', 'postgres'],
    ['postgresql://app:secret@db.example.com/db', 'db.example.com'],
    ['postgresql://app:secret@localhost.example.com/db', 'localhost.example.com'],
    ['postgresql://app:secret@10.0.0.5/db', '10.0.0.5'],
    ['postgresql://localhost:secret@db.example.com/db', 'db.example.com'],
    ['postgresql://app:secret@localhost/db?host=db.example.com', 'localhost'],
  ])('%s has hostname %s', (url, expected) => {
    expect(host(url)).toBe(expected);
  });

  it('keeps a host query parameter, which the PostgreSQL client would connect to instead', () => {
    expect(new URL('postgresql://app@localhost/db?host=db.example.com').searchParams.get('host')).toBe(
      'db.example.com',
    );
  });

  it('throws on a malformed URL', () => {
    // The error is a TypeError of Node's own realm (ERR_INVALID_URL), so match the message, not the class.
    expect(() => new URL('not a url')).toThrow('Invalid URL');
    expect(() => new URL('postgresql://app@[::1/db')).toThrow('Invalid URL');
  });

  it('does not treat a string mention of localhost as the host', () => {
    const value = 'postgresql://app:localhost@db.example.com/localhost';

    expect(value.includes('localhost')).toBe(true);
    expect(host(value)).toBe('db.example.com');
  });
});
