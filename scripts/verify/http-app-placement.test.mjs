import assert from 'node:assert/strict';
import { test } from 'node:test';
import { perTestAppProblems } from './http-app-placement.mjs';

test('accepts an application built in beforeAll, directly or through a helper', () => {
  const text = `
    async function startApp() { return Test.createTestingModule({}).compile(); }
    let app; beforeAll(async () => { app = await createHttpContractApp(); await startApp(); });
    it('works', async () => { await request(app.getHttpServer()); });`;
  assert.deepEqual(perTestAppProblems('a.http-spec.ts', text), []);
});

test('flags an application built inside it, it.each, test or beforeEach', () => {
  const text = `
    it('a', async () => { await createHttpContractApp(); });
    it.each([[1]])('b %s', async () => { await Test.createTestingModule({}).compile(); });
    test('c', async () => { await createHttpContractApp(); });
    beforeEach(async () => { await createHttpContractApp(); });`;
  assert.deepEqual(
    perTestAppProblems('a.http-spec.ts', text).map((p) => p.replace(/^a\.http-spec\.ts:\d+: /, '')),
    [
      'createHttpContractApp() runs inside it(); build the app in beforeAll',
      'createTestingModule() runs inside it(); build the app in beforeAll',
      'createHttpContractApp() runs inside test(); build the app in beforeAll',
      'createHttpContractApp() runs inside beforeEach(); build the app in beforeAll',
    ],
  );
});

test('flags a helper of the same file that builds an application when a test calls it', () => {
  const text = `
    const appFor = async (identity) => Test.createTestingModule({}).compile();
    it('a', async () => { await appFor(null); });`;
  assert.equal(perTestAppProblems('a.http-spec.ts', text).length, 1);
});
