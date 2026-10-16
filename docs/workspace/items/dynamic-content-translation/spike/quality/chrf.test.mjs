import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceChrF, corpusChrF, charNgrams } from './lib/chrf.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('charNgrams removes whitespace and counts n-grams', () => {
  const m = charNgrams('a b a', 2); // "aba" -> ab, ba
  assert.equal(m.get('ab'), 1);
  assert.equal(m.get('ba'), 1);
  assert.equal(m.size, 2);
});

test('identical strings score 100', () => {
  near(sentenceChrF('Yêu cầu đã được phê duyệt bởi trưởng phòng.', 'Yêu cầu đã được phê duyệt bởi trưởng phòng.'), 100);
});

test('whitespace differences are ignored (whitespace=False default)', () => {
  near(sentenceChrF('the  request is approved', 'the request is approved'), 100);
});

test('disjoint strings score 0', () => {
  near(sentenceChrF('abcdefgh', 'xyzwuvqp'), 0);
});

test('hand-computed case: hyp "abc", ref "abd" -> 38.888...', () => {
  // orders 1..3 effective (hyp/ref lengths 3). precision=recall per order:
  // n=1: 2/3, n=2: 1/2, n=3: 0 ; orders 4..6 have no n-grams and are skipped.
  // avgP = avgR = (2/3 + 1/2 + 0) / 3 = 7/18 ; F = 7/18 => 38.8888...
  near(sentenceChrF('abc', 'abd'), (100 * 7) / 18);
});

test('beta=2 weights recall over precision', () => {
  // hyp is a strict substring of ref: precision 1, recall < 1 ; compare with swapped.
  const hypShort = sentenceChrF('abcdef', 'abcdefghij');
  const hypLong = sentenceChrF('abcdefghij', 'abcdef');
  assert.ok(hypLong > hypShort, `${hypLong} should be > ${hypShort}`);
});

test('corpus score pools n-gram statistics (not the mean of sentence scores)', () => {
  const hyps = ['abc', 'abcdefghijkl'];
  const refs = ['abd', 'abcdefghijkl'];
  const corpus = corpusChrF(hyps, refs);
  const mean = (sentenceChrF(hyps[0], refs[0]) + sentenceChrF(hyps[1], refs[1])) / 2;
  assert.ok(corpus > mean, `corpus ${corpus} should exceed sentence mean ${mean} here`);
  // identical corpus -> 100
  near(corpusChrF(refs, refs), 100);
});

test('empty hypothesis scores 0 and does not throw', () => {
  near(sentenceChrF('', 'something'), 0);
});

test('mismatched corpus lengths throw', () => {
  assert.throws(() => corpusChrF(['a'], ['a', 'b']), /length/);
});
