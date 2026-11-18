import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, joinSegments } from '../segmenter.mjs';

test('empty / whitespace only gives no segments', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('  \n\t '), []);
});

test('splits on sentence punctuation followed by whitespace, trims, keeps order', () => {
  assert.deepEqual(splitSentences('Xin chào. Bạn khỏe không?  Tôi khỏe!\nCảm ơn.'), [
    'Xin chào.',
    'Bạn khỏe không?',
    'Tôi khỏe!',
    'Cảm ơn.',
  ]);
});

test('does not split decimals or abbreviations without trailing space', () => {
  assert.deepEqual(splitSentences('Giá là 1.5 triệu. Xong.'), ['Giá là 1.5 triệu.', 'Xong.']);
});

test('text without punctuation is a single segment', () => {
  assert.deepEqual(splitSentences('khong co dau cau'), ['khong co dau cau']);
});

test('over-long segments are split at whitespace, never exceed maxChars, nothing lost', () => {
  const long = Array.from({ length: 200 }, (_, i) => 'từ' + i).join(' ');
  const parts = splitSentences(long, { maxChars: 120 });
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 120, `len ${p.length}`);
  assert.equal(parts.join(' '), long);
});

test('a single token longer than maxChars is hard-cut', () => {
  const parts = splitSentences('x'.repeat(250), { maxChars: 100 });
  assert.deepEqual(
    parts.map((p) => p.length),
    [100, 100, 50],
  );
});

test('joinSegments joins with a single space', () => {
  assert.equal(joinSegments(['A.', 'B.']), 'A. B.');
});
