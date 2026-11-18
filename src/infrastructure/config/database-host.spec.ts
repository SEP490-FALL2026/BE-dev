import { classifyDatabaseUrl } from './database-host';

describe('classifyDatabaseUrl', () => {
  it.each([
    'postgresql://app:secret@localhost:5432/software_license_management',
    'postgresql://app:secret@LOCALHOST/db',
    'postgres://app@localhost/db',
    'postgresql://app:secret@127.0.0.1:5432/db',
    'postgresql://app@127.255.0.9/db',
    'postgresql://app:secret@[::1]:5432/db',
    'postgresql://app:secret@[0:0:0:0:0:0:0:1]/db',
    'postgresql://app:secret@localhost/db?schema=public&connect_timeout=5',
  ])('accepts the loopback database %s', (url) => {
    expect(classifyDatabaseUrl(url)).toBe('loopback');
  });

  it.each([
    ['a Docker service name', 'postgresql://app:secret@postgres:5432/db'],
    ['a remote name', 'postgresql://app:secret@db.example.com/db'],
    ['a deceptive suffix', 'postgresql://app:secret@localhost.example.com/db'],
    ['a deceptive prefix', 'postgresql://app:secret@my-localhost/db'],
    ['a private address', 'postgresql://app:secret@10.0.0.5/db'],
    ['a LAN address', 'postgresql://app:secret@192.168.1.20/db'],
    ['a public address', 'postgresql://app:secret@203.0.113.7/db'],
    ['the any address', 'postgresql://app:secret@0.0.0.0/db'],
    ['an IPv4-mapped IPv6 loopback', 'postgresql://app:secret@[::ffff:127.0.0.1]/db'],
    ['another IPv6 address', 'postgresql://app:secret@[fe80::1]/db'],
    ['localhost only in the credentials', 'postgresql://localhost:localhost@db.example.com/localhost'],
    ['a host query parameter', 'postgresql://app:secret@localhost/db?host=db.example.com'],
    ['a hostaddr query parameter', 'postgresql://app:secret@localhost/db?hostaddr=203.0.113.7'],
    ['a socket directory', 'postgresql://app@localhost/db?host=/var/run/postgresql'],
    ['several hosts', 'postgresql://app:secret@localhost,db.example.com/db'],
  ])('refuses %s', (_case, url) => {
    expect(classifyDatabaseUrl(url)).toBe('not-loopback');
  });

  it.each([
    ['a malformed URL', 'not a url'],
    ['an unclosed IPv6 bracket', 'postgresql://app@[::1/db'],
    ['another scheme', 'mysql://app@localhost/db'],
    ['an empty value', ''],
    ['no host (the URL parser rejects it)', 'postgresql://app@/db'],
  ])('reports %s as invalid', (_case, url) => {
    expect(classifyDatabaseUrl(url)).toBe('invalid');
  });

  it('decides by the parsed host, never by a substring of the URL', () => {
    const url = 'postgresql://app:localhost@db.example.com/localhost?application_name=localhost';

    expect(url.includes('localhost')).toBe(true);
    expect(classifyDatabaseUrl(url)).toBe('not-loopback');
  });
});
