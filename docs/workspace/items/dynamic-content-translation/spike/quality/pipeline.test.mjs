import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateText } from './lib/pipeline.mjs';

// Fake model: maps known (protected) source segments to outputs; unknown segments are echoed in upper case.
// A table value may be a string or a full adapter result ({ text, finishReason, ... }).
const seg = (text, finishReason = 'eos') => ({
  text,
  inputTokens: 5,
  generatedTokens: 5,
  endedWithEos: finishReason === 'eos',
  finishReason,
});
const fakeModel = (table = {}, calls = []) => ({
  async translateSegment(text) {
    calls.push(text);
    if (text in table) return typeof table[text] === 'string' ? seg(table[text]) : table[text];
    return seg(text.toUpperCase().replace(/<X(\d+)>/g, '<x$1>'));
  },
  countTokens: (t) => t.length,
});

const base = (model, extra = {}) => ({
  direction: 'vi-en',
  mode: 'protected',
  maxSegmentTokens: 100,
  ...model,
  ...extra,
});

test('translates per sentence, keeps the original separators, restores spans; one model call per segment', async () => {
  const calls = [];
  const model = fakeModel(
    {
      'Yêu cầu <x0> đã được duyệt.': 'Request <x0> has been approved.',
      'Cảm ơn <x0>!': 'Thanks <x0>!',
    },
    calls,
  );
  const r = await translateText(
    'Yêu cầu REQ-2026-0042 đã được duyệt. Cảm ơn Trần An!',
    base(model, { knownTerms: ['Trần An'] }),
  );
  assert.equal(r.output, 'Request REQ-2026-0042 has been approved. Thanks Trần An!');
  assert.deepEqual(r.counts, { total: 2, translated: 2, fallback: 0 });
  assert.equal(r.status, 'TRANSLATED');
  assert.equal(r.reason, null);
  assert.deepEqual(calls, ['Yêu cầu <x0> đã được duyệt.', 'Cảm ơn <x0>!']);
  assert.ok(r.segments.every((s) => typeof s.ms === 'number'));
});

test('newlines between segments are preserved', async () => {
  const model = fakeModel({ 'Dòng một': 'Line one', 'Dòng hai': 'Line two' });
  const r = await translateText('Dòng một\n\nDòng hai', base(model));
  assert.equal(r.output, 'Line one\n\nLine two');
});

test('placeholder gate: ONE bad segment returns the EXACT original field, never mixed output', async () => {
  const model = fakeModel({
    'Duyệt <x0> cho <x1>.': 'Approve <x0> for the team.', // lost <x1>
    'Câu hai là <x0>.': 'Second is <x0>.',
  });
  const src = '  Duyệt Figma cho Lê Hoa.  Câu hai là REQ-2026-0001.\n';
  const r = await translateText(src, base(model, { knownTerms: ['Figma', 'Lê Hoa'] }));
  assert.equal(r.output, src, 'byte-for-byte original, no trimming or normalisation');
  assert.equal(r.status, 'NOT_TRANSLATED');
  assert.equal(r.reason, 'PLACEHOLDER_GATE');
  assert.deepEqual(r.counts, { total: 2, translated: 0, fallback: 2 });
  assert.deepEqual(r.detail.gate.missing, [1]);
  assert.notEqual(r.status, 'PARTIAL');
});

test('placeholder gate: duplicated and extra placeholders fall back the whole field', async () => {
  const dup = fakeModel({ 'A <x0>.': 'A <x0> <x0>.', 'B <x0>.': 'B <x0>.' });
  const r1 = await translateText('A Figma.\nB Slack.', base(dup, { knownTerms: ['Figma', 'Slack'] }));
  assert.equal(r1.output, 'A Figma.\nB Slack.');
  assert.equal(r1.reason, 'PLACEHOLDER_GATE');
  assert.deepEqual(r1.detail.gate.duplicated, [0]);
  const extra = fakeModel({ 'A <x0>.': 'A <x0>.', 'B <x0>.': 'B <x0> <x7>.' });
  const r2 = await translateText('A Figma.\nB Slack.', base(extra, { knownTerms: ['Figma', 'Slack'] }));
  assert.equal(r2.output, 'A Figma.\nB Slack.');
  assert.deepEqual(r2.detail.gate.extra, [7]);
});

test('TOO_LONG: a segment over the limit with no clause boundary never reaches the model; the field falls back whole', async () => {
  const calls = [];
  const long = 'Rất dài '.repeat(20).trim() + '.';
  const model = fakeModel({ 'Ngắn.': 'Short.' }, calls);
  const src = `${long} Ngắn.`;
  const r = await translateText(src, base(model, { maxSegmentTokens: 50 }));
  assert.equal(r.output, src);
  assert.equal(r.status, 'NOT_TRANSLATED');
  assert.equal(r.reason, 'TOO_LONG');
  assert.deepEqual(calls, [], 'planning fails before any model call');
});

test('long sentence is split at clause boundaries (placeholders intact across pieces) and the pieces are joined back', async () => {
  const calls = [];
  const words = (t) => t.split(/\s+/).filter(Boolean).length;
  const src = 'Trần An cần Figma, ngân sách là 4200 USD; Lê Hoa xác nhận.';
  const m2 = {
    countTokens: words,
    async translateSegment(t) {
      calls.push(t);
      return seg(
        t
          .replace('<x0> cần <x1>,', '<x0> needs <x1>,')
          .replace('ngân sách là <x2>;', 'budget is <x2>;')
          .replace('<x3> xác nhận.', '<x3> confirms.'),
      );
    },
  };
  const r = await translateText(src, {
    direction: 'vi-en',
    mode: 'protected',
    maxSegmentTokens: 7,
    knownTerms: ['Trần An', 'Figma', 'Lê Hoa'],
    ...m2,
  });
  assert.equal(r.status, 'TRANSLATED', JSON.stringify(r.detail));
  assert.equal(r.output, 'Trần An needs Figma, budget is 4200 USD; Lê Hoa confirms.');
  assert.ok(calls.length >= 2, `split into pieces: ${JSON.stringify(calls)}`);
  assert.ok(calls.every((c) => words(c) <= 7));
  for (const c of calls) assert.equal((c.match(/</g) ?? []).length, (c.match(/>/g) ?? []).length);
});

test('a piece that still exceeds the limit after clause splitting makes the whole field TOO_LONG', async () => {
  const calls = [];
  const model = { ...fakeModel({}, calls), countTokens: (t) => t.split(/\s+/).filter(Boolean).length };
  const src = 'một hai ba bốn năm sáu bảy tám chín mười, mười một mười hai';
  const r = await translateText(src, { direction: 'vi-en', mode: 'protected', maxSegmentTokens: 8, ...model });
  assert.equal(r.reason, 'TOO_LONG');
  assert.equal(r.output, src);
  assert.deepEqual(calls, []);
});

test('token guard counts the protected text (placeholders shorten the segment)', async () => {
  const model = fakeModel({ 'Cần <x0> ngay.': 'Need <x0> now.' });
  const r = await translateText(
    'Cần Một-Cái-Tên-Rất-Dài-Của-Phần-Mềm ngay.',
    base(model, { maxSegmentTokens: 20, knownTerms: ['Một-Cái-Tên-Rất-Dài-Của-Phần-Mềm'] }),
  );
  assert.equal(r.output, 'Need Một-Cái-Tên-Rất-Dài-Của-Phần-Mềm now.');
});

test('placeholder-only segments skip the model', async () => {
  const calls = [];
  const model = fakeModel({ 'Xong.': 'Done.' }, calls);
  const r = await translateText('REQ-2026-0042\nXong.', base(model));
  assert.equal(r.output, 'REQ-2026-0042\nDone.');
  assert.deepEqual(calls, ['Xong.']);
  assert.equal(r.status, 'TRANSLATED');
});

test('collision: literal placeholder-looking source text survives an echoing model', async () => {
  const model = { ...fakeModel(), translateSegment: async (t) => seg(t) };
  const src = 'Giá trị <x0> và <x1> được giữ nguyên với REQ-2026-0042.';
  const r = await translateText(src, base(model));
  assert.equal(r.output, src);
  assert.equal(r.status, 'TRANSLATED');
});

test('collision: a model that invents a placeholder is caught by the gate and the original comes back', async () => {
  const model = { countTokens: (t) => t.length, translateSegment: async () => seg('Output <x0> and <x5>') };
  const src = 'Có <x0> ở đây';
  const r = await translateText(src, base(model));
  assert.equal(r.output, src);
  assert.equal(r.reason, 'PLACEHOLDER_GATE');
});

test('textual dates stay verbatim (no localisation)', async () => {
  const model = fakeModel({ 'Hạn là <x0>.': 'The deadline is <x0>.' });
  const r = await translateText('Hạn là ngày 15 tháng 11 năm 2026.', base(model));
  assert.equal(r.output, 'The deadline is ngày 15 tháng 11 năm 2026.');
});

test('raw mode: no protection, no placeholder gate, no polarity gate, no length guard; a non-eos finish is only recorded', async () => {
  const calls = [];
  const model = fakeModel({ 'Yêu cầu bị từ chối.': seg('The request was approved.', 'max_new_tokens') }, calls);
  const r = await translateText(
    'Gửi Figma cho Lê Hoa. Yêu cầu bị từ chối.',
    base(model, { mode: 'raw', maxSegmentTokens: 3 }),
  );
  assert.deepEqual(calls, ['Gửi Figma cho Lê Hoa.', 'Yêu cầu bị từ chối.']);
  assert.equal(r.output, 'GỬI FIGMA CHO LÊ HOA. The request was approved.');
  assert.equal(r.status, 'TRANSLATED');
  assert.deepEqual(r.counts, { total: 2, translated: 2, fallback: 0 });
  assert.deepEqual(r.finishReasons, { eos: 1, max_new_tokens: 1 });
});

test('raw mode: a model error still returns the exact original with NOT_TRANSLATED / ERROR', async () => {
  const boom = {
    countTokens: () => 1,
    translateSegment: async () => {
      throw new Error('boom');
    },
  };
  const r = await translateText('Một. Hai.', base(boom, { mode: 'raw' }));
  assert.equal(r.output, 'Một. Hai.');
  assert.equal(r.reason, 'ERROR');
});

test('model error falls the whole field back (no PARTIAL), and later segments are not attempted', async () => {
  let n = 0;
  const flaky = {
    countTokens: () => 1,
    async translateSegment(t) {
      n++;
      if (n === 1) return seg('One.');
      throw Object.assign(new Error('boom'), { code: 'RUN_FAILED' });
    },
  };
  const src = 'Một. Hai. Ba.';
  const r = await translateText(src, base(flaky));
  assert.equal(r.output, src);
  assert.equal(r.status, 'NOT_TRANSLATED');
  assert.equal(r.reason, 'ERROR');
  assert.equal(r.detail.code, 'RUN_FAILED');
  assert.equal(n, 2, 'stops at the first failing segment');
});

test('finishReason other than eos falls back: max_new_tokens and stopped', async () => {
  const mk = (finishReason) => fakeModel({ 'Một câu.': seg('One sentence', finishReason) });
  const r1 = await translateText('Một câu.', base(mk('max_new_tokens')));
  assert.equal(r1.reason, 'MAX_NEW_TOKENS');
  assert.equal(r1.output, 'Một câu.');
  const r2 = await translateText('Một câu.', base(mk('stopped')));
  assert.equal(r2.reason, 'NOT_EOS');
  assert.equal(r2.output, 'Một câu.');
});

test('polarity gate: a flipped decision falls back with QUALITY_GATE and the exact original', async () => {
  const model = fakeModel({ 'Yêu cầu đã bị từ chối.': 'The request was approved.' });
  const r = await translateText('Yêu cầu đã bị từ chối.', base(model));
  assert.equal(r.status, 'NOT_TRANSLATED');
  assert.equal(r.reason, 'QUALITY_GATE');
  assert.deepEqual(r.detail.polarity.missing, ['reject']);
  assert.equal(r.output, 'Yêu cầu đã bị từ chối.');
});

test('polarity gate: valid synonyms pass; protected spans are not scanned for cues', async () => {
  const ok = await translateText(
    'Ban giám đốc tán thành kế hoạch.',
    base(fakeModel({ 'Ban giám đốc tán thành kế hoạch.': 'The board endorsed the plan.' })),
  );
  assert.equal(ok.status, 'TRANSLATED');
  // an e-mail address that contains "approvers" must neither require nor satisfy the approve class
  const model = fakeModel({ 'Gửi tới <x0>.': 'Send to <x0>.' });
  const r = await translateText('Gửi tới finance-approvers@acme-demo.example.', base(model));
  assert.equal(r.status, 'TRANSLATED');
  const flip = fakeModel({ 'Duyệt <x0>.': 'Hello <x0>.' });
  const r2 = await translateText('Duyệt finance-approvers@acme-demo.example.', base(flip));
  assert.equal(r2.reason, 'QUALITY_GATE', 'the restored e-mail text "approvers" must not satisfy the approve class');
});

test('polarity gate: glossary terms carry their cue through the placeholder', async () => {
  // "thu hồi" is a glossary term (placeholder); the restored English "revoke" satisfies the revoke class
  const model = fakeModel({ 'Cần <x0> tài khoản.': 'Need to <x0> the account.' });
  const r = await translateText('Cần thu hồi tài khoản.', base(model));
  assert.equal(r.output, 'Need to revoke the account.');
  assert.equal(r.status, 'TRANSLATED');
  const lost = fakeModel({ 'Cần <x0> tài khoản.': 'Need <x0> the account.' });
  assert.equal(
    (await translateText('Cần thu hồi tài khoản.', base(lost))).status,
    'TRANSLATED',
    'placeholder present => restored cue present',
  );
});

test('empty / whitespace / null sources are returned exactly as given with NOT_NEEDED / SOURCE_EMPTY and no model call', async () => {
  for (const src of ['', '  ', '\n\t ', null, undefined]) {
    const calls = [];
    const r = await translateText(src, base(fakeModel({}, calls)));
    assert.equal(Object.is(r.output, src), true, JSON.stringify(src));
    assert.equal(r.status, 'NOT_NEEDED');
    assert.equal(r.reason, 'SOURCE_EMPTY');
    assert.deepEqual(calls, []);
    assert.deepEqual(r.counts, { total: 0, translated: 0, fallback: 0 });
  }
});

test('glossary terms are restored with the target-language term', async () => {
  const model = fakeModel({ '<x0> đã duyệt.': '<x0> approved.' });
  const r = await translateText('Trưởng phòng đã duyệt.', base(model));
  assert.equal(r.output, 'Department head approved.');
});

test('status is only ever TRANSLATED, NOT_TRANSLATED or NOT_NEEDED', async () => {
  const seen = new Set();
  const bad = { countTokens: () => 1, translateSegment: async () => seg('<x0> <x0>') };
  for (const [src, model] of [
    ['Một. Hai.', fakeModel()],
    ['Có Figma. Hai.', bad],
    ['', fakeModel()],
  ]) {
    seen.add((await translateText(src, base(model, { knownTerms: ['Figma'] }))).status);
  }
  for (const s of seen) assert.ok(['TRANSLATED', 'NOT_TRANSLATED', 'NOT_NEEDED'].includes(s), s);
});
