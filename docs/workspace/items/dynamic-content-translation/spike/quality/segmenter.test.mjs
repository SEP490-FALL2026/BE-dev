import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentText, joinSegments } from './lib/segmenter.mjs';

const texts = (s) => segmentText(s).map((x) => x.text);

test('splits on sentence punctuation followed by an uppercase letter', () => {
  assert.deepEqual(texts('Yêu cầu đã được duyệt. Vui lòng cài đặt ngay! Bạn đã sẵn sàng? Vâng.'), [
    'Yêu cầu đã được duyệt.',
    'Vui lòng cài đặt ngay!',
    'Bạn đã sẵn sàng?',
    'Vâng.',
  ]);
});

test('does not split inside decimals or thousand-separated amounts', () => {
  assert.deepEqual(texts('Chi phí là 1.500.000 đồng mỗi năm. Tỷ lệ tăng 2.5% so với năm trước.'), [
    'Chi phí là 1.500.000 đồng mỗi năm.',
    'Tỷ lệ tăng 2.5% so với năm trước.',
  ]);
  assert.deepEqual(texts('The fee is $1,200.50 per seat. It renews yearly.'), [
    'The fee is $1,200.50 per seat.',
    'It renews yearly.',
  ]);
});

test('does not split on dates such as 15/11/2026 or 01.10.2026', () => {
  assert.deepEqual(texts('Hạn báo hủy là 15/11/2026. Sau ngày 01.10.2026 không thể hủy.'), [
    'Hạn báo hủy là 15/11/2026.',
    'Sau ngày 01.10.2026 không thể hủy.',
  ]);
});

test('handles abbreviations without splitting', () => {
  assert.deepEqual(texts('Ông TS. Lê Minh đã duyệt. Mr. Hale approved it, e.g. for Figma, etc. Next steps follow.'), [
    'Ông TS. Lê Minh đã duyệt.',
    'Mr. Hale approved it, e.g. for Figma, etc. Next steps follow.',
  ]);
});

test('abbreviation "etc." followed by a capitalised word is still not a boundary', () => {
  // Known conservative behaviour: abbreviations never split, even before a capital.
  assert.equal(texts('We use Slack, Jira, etc. Then we stop.').length, 1);
});

test('newlines are always boundaries and are preserved by joinSegments', () => {
  const src = 'Dòng một\nDòng hai. Câu ba.\n\nDòng bốn';
  const segs = segmentText(src);
  assert.deepEqual(
    segs.map((s) => s.text),
    ['Dòng một', 'Dòng hai.', 'Câu ba.', 'Dòng bốn'],
  );
  assert.equal(joinSegments(segs.map((s) => ({ text: s.text, sep: s.sep }))), src);
});

test('round-trips text exactly when segments are unchanged', () => {
  const src = 'First sentence.  Second one! Third?\nFourth, with 3.14 inside. Done.';
  assert.equal(joinSegments(segmentText(src)), src);
});

test('lowercase continuation after a period does not split', () => {
  assert.deepEqual(texts('Phiên bản v2.1 hết hạn. cần gia hạn sớm.'), ['Phiên bản v2.1 hết hạn. cần gia hạn sớm.']);
});

test('quotes and brackets may open a sentence', () => {
  assert.deepEqual(texts('He said no. "Please reconsider." (Second note.)'), [
    'He said no.',
    '"Please reconsider."',
    '(Second note.)',
  ]);
});

test('empty and whitespace-only input yield no segments', () => {
  assert.deepEqual(segmentText(''), []);
  assert.deepEqual(segmentText('  \n  '), []);
});

test('text without terminal punctuation is one segment', () => {
  assert.deepEqual(texts('Cần cài Figma cho dự án mới'), ['Cần cài Figma cho dự án mới']);
});

// ---- clause splitting by real token count (the counter is injected; here: one token per word) ----------------------
import { splitToLimit } from './lib/segmenter.mjs';

const words = (t) => String(t).split(/\s+/).filter(Boolean).length;
const piecesOf = (text, max, count = words) => splitToLimit(text, count, max);
const rejoin = (pieces) => pieces.map((p) => p.text + p.sep).join('');

test('splitToLimit: a segment within the limit stays one piece', () => {
  const r = piecesOf('Yêu cầu đã được duyệt, cảm ơn bạn.', 20);
  assert.equal(r.ok, true);
  assert.deepEqual(r.pieces, [{ text: 'Yêu cầu đã được duyệt, cảm ơn bạn.', sep: '' }]);
});

test('splitToLimit: splits at comma and semicolon, keeps the delimiter with the left piece, round-trips exactly', () => {
  const src = 'Nhóm cần thêm giấy phép Figma, ngân sách đã được duyệt; trưởng phòng xác nhận rồi, vì vậy xin cấp sớm';
  const r = piecesOf(src, 8);
  assert.equal(r.ok, true);
  assert.ok(r.pieces.length >= 2);
  for (const p of r.pieces) assert.ok(words(p.text) <= 8, p.text);
  assert.equal(rejoin(r.pieces), src);
  assert.ok(r.pieces[0].text.endsWith(','));
  assert.equal(r.pieces[r.pieces.length - 1].sep, '');
});

test('splitToLimit: splits before vi and en conjunctions (the conjunction starts the next piece)', () => {
  const vi = 'Chúng tôi đã so sánh hai công cụ này và thấy công cụ thứ nhất phù hợp hơn nhưng giá cao hơn nhiều';
  const rv = piecesOf(vi, 12);
  assert.equal(rv.ok, true);
  assert.equal(rejoin(rv.pieces), vi);
  assert.ok(rv.pieces.some((p) => p.text.startsWith('và ')) || rv.pieces.some((p) => p.text.startsWith('nhưng ')));
  const en = 'The team compared both tools and found the first one more suitable but the price is much higher because of the extra seats';
  const re = piecesOf(en, 12);
  assert.equal(re.ok, true);
  assert.equal(rejoin(re.pieces), en);
  assert.ok(re.pieces.every((p) => words(p.text) <= 12));
  assert.ok(re.pieces.slice(1).some((p) => /^(and|but|because)\s/.test(p.text)));
});

test('splitToLimit: clauses are packed greedily up to the limit (no needless splits)', () => {
  const src = 'a b, c d, e f, g h';
  assert.deepEqual(
    piecesOf(src, 4).pieces.map((p) => p.text),
    ['a b, c d,', 'e f, g h'],
  );
  assert.deepEqual(
    piecesOf(src, 8).pieces.map((p) => p.text),
    [src],
  );
});

test('splitToLimit: only a comma followed by whitespace is a boundary (1,500 and a.b,c stay intact); conjunction must be a whole word', () => {
  const src = 'Phí là 1,500 USD mỗi năm và candy handy bandit';
  const r = piecesOf(src, 6);
  assert.equal(r.ok, true);
  for (const p of r.pieces) assert.ok(!/1$/.test(p.text) && !/^500/.test(p.text), p.text);
  assert.ok(r.pieces.every((p) => !/^dy\b|^ndy\b/.test(p.text)));
  assert.equal(rejoin(r.pieces), src);
});

test('splitToLimit: placeholders <xN> are never cut, whatever the counter says', () => {
  const src = 'Gửi <x0>, <x1> và <x2>, rồi nhờ <x3> kiểm tra <x4>; xong <x5>';
  // a counter that charges every character, so pieces are tiny
  const r = splitToLimit(src, (t) => t.length, 28);
  assert.equal(r.ok, true);
  assert.equal(rejoin(r.pieces), src);
  assert.ok(r.pieces.length >= 3, 'the text really was split');
  const found = r.pieces.flatMap((p) => p.text.match(/<x\d+>/g) ?? []);
  assert.deepEqual(found, ['<x0>', '<x1>', '<x2>', '<x3>', '<x4>', '<x5>']);
  for (const p of r.pieces) assert.equal((p.text.match(/</g) ?? []).length, (p.text.match(/>/g) ?? []).length, p.text);
});

test('splitToLimit: a clause that is still too long, or no boundary at all, gives TOO_LONG', () => {
  const noBoundary = piecesOf('một hai ba bốn năm sáu bảy tám chín mười', 5);
  assert.deepEqual({ ok: noBoundary.ok, reason: noBoundary.reason }, { ok: false, reason: 'TOO_LONG' });
  const oneBig = piecesOf('ngắn thôi, một hai ba bốn năm sáu bảy tám chín mười, lại ngắn', 5);
  assert.deepEqual({ ok: oneBig.ok, reason: oneBig.reason }, { ok: false, reason: 'TOO_LONG' });
});

test('splitToLimit: the injected counter decides (a counter that charges placeholders heavily forces a split)', () => {
  const heavy = (t) => words(t) + 5 * (t.match(/<x\d+>/g) ?? []).length;
  const r = splitToLimit('Gửi <x0> và nhờ <x1> và <x2> ngay', heavy, 12);
  assert.equal(r.ok, true);
  assert.ok(r.pieces.length >= 2);
  assert.ok(r.pieces.every((p) => heavy(p.text) <= 12));
});
