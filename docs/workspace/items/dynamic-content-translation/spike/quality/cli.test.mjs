import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './lib/cli.mjs';

test('defaults', () => {
  assert.deepEqual(parseArgs([]), {
    direction: 'both',
    mode: 'both',
    fixtures: 'main',
    tag: null,
    warmup: 2,
    repetitions: 3,
    out: null,
    maxSegmentTokens: 128,
    limit: null,
    knownTerms: 'fixture',
  });
});

test('parses every option', () => {
  const o = parseArgs(['--direction', 'vi-en', '--mode', 'protected', '--fixtures', 'heldout', '--tag', '4.3.1', '--warmup', '0', '--repetitions', '1', '--out', 'x.json', '--max-segment-tokens', '96', '--limit', '5', '--known-terms', 'none']);
  assert.deepEqual(o, { direction: 'vi-en', mode: 'protected', fixtures: 'heldout', tag: '4.3.1', warmup: 0, repetitions: 1, out: 'x.json', maxSegmentTokens: 96, limit: 5, knownTerms: 'none' });
});

test('also accepts --key=value', () => {
  assert.equal(parseArgs(['--direction=en-vi']).direction, 'en-vi');
  assert.equal(parseArgs(['--fixtures=main,heldout']).fixtures, 'main,heldout');
});

test('rejects invalid values and unknown flags (batch size and the old 512 guard are gone)', () => {
  assert.throws(() => parseArgs(['--direction', 'fr-en']), /direction/);
  assert.throws(() => parseArgs(['--mode', 'fast']), /mode/);
  assert.throws(() => parseArgs(['--fixtures', 'other']), /fixtures/);
  assert.throws(() => parseArgs(['--repetitions', '0']), /repetitions/);
  assert.throws(() => parseArgs(['--warmup', '-1']), /warmup/);
  assert.throws(() => parseArgs(['--max-segment-tokens', '0']), /max-segment-tokens/);
  assert.throws(() => parseArgs(['--known-terms', 'all']), /known-terms/);
  assert.throws(() => parseArgs(['--bogus']), /unknown/i);
  assert.throws(() => parseArgs(['--batch-size', '8']), /unknown/i);
  assert.throws(() => parseArgs(['--max-tokens', '400']), /unknown/i);
  assert.throws(() => parseArgs(['--out']), /requires a value/);
});
