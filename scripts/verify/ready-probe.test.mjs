// F93 (H7-OPS-RV-04): the readiness probe the deploy script runs inside the API container. Extracts the probe from
// scripts/ops/deploy-release.sh and runs it with node against a local HTTP server: the exit status of a 2xx, and what is printed when
// the answer is not 2xx — the status, the machine code and the request id of the error envelope, never a body or a message, which can
// carry a host, a role or a secret — and the budgets of the caller against the dependency. Pure and local: no Docker, no database, no
// real API.
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

const SCRIPT = readFileSync(resolve(import.meta.dirname, '..', 'ops', 'deploy-release.sh'), 'utf8');
const HEALTH = readFileSync(
  resolve(import.meta.dirname, '..', '..', 'src', 'infrastructure', 'health', 'health.controller.ts'),
  'utf8',
);
const PROBE = /^READY_PROBE='([^']*)'$/m.exec(SCRIPT)?.[1];
const CANARY = 'canary-4f1c2d9e7a6b-postgres://svc:hunter2@db.internal:5432/slm';

/** What the fake API answers on the readiness path: a status and a body. */
let answer = { status: 200, body: '' };
let server;
let port;

const listening = (instance) =>
  new Promise((done) => {
    instance.listen(0, '127.0.0.1', () => done(instance.address().port));
  });

/** Runs the probe against a port of this machine; never blocks the event loop, which the fake API needs. */
const probe = (target) =>
  new Promise((done) => {
    const child = spawn(process.execPath, ['-e', PROBE], {
      env: { ...process.env, PORT: String(target), API_PREFIX: 'api' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => done({ code, output: output.trim() }));
  });

describe('the readiness probe of the deploy script (F93)', () => {
  before(async () => {
    assert.ok(PROBE, 'READY_PROBE is one single-quoted line of deploy-release.sh');
    server = createServer((request, response) => {
      assert.equal(request.url, '/api/v1/health/ready');
      response.writeHead(answer.status, { 'content-type': 'application/json' });
      response.end(answer.body);
    });
    port = await listening(server);
  });
  after(() => server.close());

  it('exits 0 and prints nothing when the API answers ready', async () => {
    answer = { status: 200, body: '{"success":true}' };

    assert.deepEqual(await probe(port), { code: 0, output: '' });
  });

  it('prints the status, the machine code and the request id of the error envelope, and not its message', async () => {
    answer = {
      status: 503,
      body: JSON.stringify({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: CANARY, details: { host: CANARY }, requestId: 'req-7f3a-01' },
      }),
    };

    const result = await probe(port);

    assert.equal(result.code, 1);
    assert.equal(result.output, 'HTTP 503 SERVICE_UNAVAILABLE request req-7f3a-01');
    assert.ok(!result.output.includes('hunter2'));
  });

  it('prints only the status for a body that is not an error envelope, whatever it says', async () => {
    for (const body of [`<html><body>${CANARY}</body></html>`, CANARY, '', JSON.stringify({ error: CANARY })]) {
      answer = { status: 500, body };

      const result = await probe(port);

      assert.deepEqual(result, { code: 1, output: 'HTTP 500' });
    }
  });

  it('drops a code or a request id that carries text instead of the shape of an identifier', async () => {
    answer = {
      status: 503,
      body: JSON.stringify({ success: false, error: { code: `bad code ${CANARY}`, requestId: `id ${CANARY}` } }),
    };

    assert.deepEqual(await probe(port), { code: 1, output: 'HTTP 503' });
  });

  it('prints the class and the code of a failed fetch, not its message, when nothing listens', async () => {
    const closed = createServer();
    const target = await listening(closed);
    await new Promise((done) => closed.close(done));

    const result = await probe(target);

    assert.equal(result.code, 1);
    assert.match(result.output, /^fetch failed: TypeError( ECONNREFUSED)?$/);
  });

  it('is given more time than the dependency it waits for, and less than the exec that carries it', () => {
    const dependencyMs = Number(/READINESS_TIMEOUT_MS = ([\d_]+);/.exec(HEALTH)?.[1].replaceAll('_', ''));
    const probeMs = Number(/AbortSignal\.timeout\((\d+)\)/.exec(PROBE)?.[1]);
    const execSeconds = Number(/timeout (\d+) docker exec "\$api" node -e "\$READY_PROBE"/.exec(SCRIPT)?.[1]);

    assert.ok(dependencyMs > 0 && probeMs > 0 && execSeconds > 0, 'the three budgets are read from the source');
    assert.ok(
      dependencyMs < probeMs,
      `the API gives the database ${dependencyMs} ms; the probe waits ${probeMs} ms for its answer`,
    );
    assert.ok(
      probeMs < execSeconds * 1000,
      `the probe waits ${probeMs} ms; the exec that runs it ends at ${execSeconds} s`,
    );
  });
});
