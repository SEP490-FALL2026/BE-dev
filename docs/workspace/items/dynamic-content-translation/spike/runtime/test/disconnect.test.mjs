// Client disconnect hook (review finding 4): res 'close' + !writableFinished. Isolated node:http harness, real sockets.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { makeSup, sleep, waitFor } from './helpers.mjs';
import { Coordinator } from '../coordinator.mjs';
import { TranslationCache } from '../cache.mjs';
import { createDisconnectServer, onClientDisconnect } from '../bench/disconnect-hook.mjs';

const identity = { engineId: 'fake@1', modelDigest: 'd1', glossaryVersion: 'g1', placeholderPolicyVersion: 'p1' };
const servers = new Set();
const sockets = new Set();
after(() => {
  for (const s of sockets) s.destroy();
  for (const s of servers) s.close();
});

async function harness(supOpts = {}) {
  const h = makeSup({ computeMaxMs: 5000, ...supOpts });
  const coord = new Coordinator({ supervisor: h.sup, cache: new TranslationCache(), identity, timeoutMs: 4000, queueMax: 4 });
  const probes = [];
  const server = createDisconnectServer({ coord, probe: (p) => probes.push({ ...p, t: Date.now() }) });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  servers.add(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const probeOf = (t) => probes.filter((p) => p.type === t);
  return { ...h, coord, server, port, probes, probeOf, shutdown: () => coord.shutdown() };
}

const get = (port, text, { agent = false } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/t?text=' + encodeURIComponent(text), agent }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ code: res.statusCode, body: JSON.parse(b) }));
    });
    req.on('error', reject);
  });

test('(a) normal GET whose handler waits for a fake translation: abort NOT fired, listener removed after the response', async () => {
  const c = await harness();
  const r = await get(c.port, 'n=6 step=40 normal');
  assert.equal(r.code, 200);
  assert.equal(r.body.status, 'OK');
  await waitFor(() => c.probeOf('resClose').length === 1, 2000, 'res close');
  assert.equal(c.probeOf('abort').length, 0, 'abort must not fire on a normal request');
  const resp = c.probeOf('responded')[0];
  assert.equal(resp.listenersAfterDispose, resp.baseline, 'our close listener was removed once the response was written (count back to the baseline)');
  assert.equal(c.probeOf('resClose')[0].writableFinished, true);
  await c.shutdown();
});

test('characterisation: IncomingMessage "close" DOES fire for a normal GET while the handler is still waiting (why the spec hook was wrong)', async () => {
  const c = await harness();
  const r = await get(c.port, 'n=8 step=40 slowish');
  assert.equal(r.body.status, 'OK');
  const reqClose = c.probeOf('reqClose')[0];
  assert.ok(reqClose, 'req close fired');
  assert.equal(reqClose.responseFinished, false, 'req close fired BEFORE the response was finished');
  assert.ok(reqClose.t <= c.probeOf('responded')[0].t, 'and before the translation result was delivered');
  assert.equal(c.probeOf('abort').length, 0, 'the res.close + writableFinished hook did not fire');
  await c.shutdown();
});

test('(b) client destroys the socket while waiting: abort fired once, that waiter settles, another subscriber on the same key still gets its result', async () => {
  const c = await harness();
  await c.coord.translate({ organizationId: 'org1', scope: 'bench', storedSource: 'vi', target: 'en', text: 'n=1 step=1 warm' });
  c.events.length = 0;
  const text = 'n=12 step=40 shared';
  const stayer = get(c.port, text);
  await sleep(30);
  const leaver = new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: c.port, path: '/t?text=' + encodeURIComponent(text), agent: false });
    req.on('error', () => resolve('client-error'));
    setTimeout(() => req.destroy(), 80);
  });
  await leaver;
  await waitFor(() => c.probeOf('abort').length >= 1, 2000, 'abort');
  await waitFor(() => c.probeOf('responded').length >= 1, 2000, 'leaver handler settled');
  const left = c.probeOf('responded')[0];
  assert.equal(left.status, 'TIMEOUT', 'the leaver waiter settled (aborted)');
  const r = await stayer;
  assert.equal(r.body.status, 'OK', 'the other subscriber still receives its result');
  assert.equal(c.probeOf('abort').length, 1, 'abort fired exactly once');
  assert.equal(c.ofType('cancelSent').length, 0, 'job NOT cancelled: another waiter remained');
  assert.equal(c.ofType('dispatch').length, 1, 'one worker run served both');
  await c.shutdown();
});

test('(b2) the only client disconnects while RUNNING: abort once, job cancelled, slot freed after done, next request OK', async () => {
  const c = await harness();
  await c.coord.translate({ organizationId: 'org1', scope: 'bench', storedSource: 'vi', target: 'en', text: 'n=1 step=1 warm' });
  c.events.length = 0;
  const leaver = new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: c.port, path: '/t?text=' + encodeURIComponent('n=500 step=20 lonely'), agent: false });
    req.on('error', () => resolve());
    setTimeout(() => req.destroy(), 80);
  });
  await leaver;
  await waitFor(() => c.ofType('cancelSent').length === 1, 2000, 'cancel sent');
  const next = await get(c.port, 'n=1 step=1 next');
  assert.equal(next.body.status, 'OK');
  assert.equal(c.probeOf('abort').length, 1);
  await c.shutdown();
});

test('(c) keep-alive: two sequential requests on one socket never trigger the hook; closing the idle socket afterwards does not either', async () => {
  const c = await harness();
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const r1 = await get(c.port, 'n=2 step=10 k1', { agent });
  const r2 = await get(c.port, 'n=2 step=10 k2', { agent });
  assert.equal(r1.body.status, 'OK');
  assert.equal(r2.body.status, 'OK');
  agent.destroy();
  await sleep(50);
  assert.equal(c.probeOf('abort').length, 0);
  assert.equal(c.probeOf('resClose').length, 2);
  await c.shutdown();
});

test('(d) client closes right after reading the response: writableFinished is true, no abort', async () => {
  const c = await harness();
  await new Promise((resolve) => {
    const sock = net.connect(c.port, '127.0.0.1', () => sock.write('GET /t?text=n%3D2%20step%3D10%20x HTTP/1.1\r\nHost: x\r\nConnection: keep-alive\r\n\r\n'));
    sock.on('data', () => {
      sock.destroy();
      resolve();
    });
  });
  await waitFor(() => c.probeOf('resClose').length === 1, 2000, 'res close');
  assert.equal(c.probeOf('abort').length, 0);
  await c.shutdown();
});

test('(e) POST-like request with a body that is fully sent, then a normal response: no abort (body consumption closes req, not res)', async () => {
  const c = await harness();
  const r = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: c.port, method: 'POST', path: '/t?text=' + encodeURIComponent('n=4 step=30 post'), agent: false, headers: { 'content-type': 'application/json' } }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ some: 'body'.repeat(1000) }));
  });
  assert.equal(r.status, 'OK');
  assert.equal(c.probeOf('abort').length, 0);
  await c.shutdown();
});

test('unit: the hook fires at most once and dispose() removes it', () => {
  const calls = [];
  const fake = new (class extends EventEmitter {
    writableFinished = false;
  })();
  const dispose = onClientDisconnect(fake, () => calls.push(1));
  assert.equal(fake.listenerCount('close'), 1);
  fake.emit('close');
  fake.emit('close');
  assert.equal(calls.length, 1, 'once');
  const f2 = new (EventEmitter)();
  f2.writableFinished = true;
  const d2 = onClientDisconnect(f2, () => calls.push(2));
  f2.emit('close');
  assert.equal(calls.length, 1, 'finished response: not an abort');
  const f3 = new (EventEmitter)();
  f3.writableFinished = false;
  const d3 = onClientDisconnect(f3, () => calls.push(3));
  d3();
  assert.equal(f3.listenerCount('close'), 0);
  f3.emit('close');
  assert.equal(calls.length, 1);
  void dispose;
  void d2;
});
