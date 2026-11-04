import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { classifyDatabaseUrl } from '../dev/local-database-host.mjs';

for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '127.255.1.2', '[::1]'])
  test(`local seed accepts ${host}`, () =>
    assert.equal(classifyDatabaseUrl(`postgresql://user@${host}/db`), 'loopback'));
for (const url of [
  'postgresql://user@remote/db',
  'postgresql://user@localhost.evil/db',
  'postgresql://user@localhost/db?host=remote',
  'postgresql://user@localhost/db?hostaddr=10.0.0.1',
  'postgresql:///db',
  'postgresql://user@[::ffff:127.0.0.1]/db',
  'postgresql://user@10.0.0.1/db',
])
  test(`local seed refuses parsed non-loopback ${url}`, () => assert.equal(classifyDatabaseUrl(url), 'not-loopback'));
for (const url of ['', 'not-url', 'mysql://localhost/db'])
  test('local seed rejects invalid PostgreSQL URL', () => assert.equal(classifyDatabaseUrl(url), 'invalid'));
