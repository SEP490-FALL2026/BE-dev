import { test } from 'node:test';
import assert from 'node:assert/strict';
import { protectSegment, restoreSegment, checkPlaceholders, isPlaceholderOnly } from './lib/protect.mjs';

const P = (text, opts = {}) => protectSegment(text, { direction: 'vi-en', ...opts });
const roundTrip = (text, opts = {}) => {
  const p = P(text, opts);
  return restoreSegment(p.text, p.spans, { direction: opts.direction || 'vi-en' });
};

test('emails, URLs and request codes become placeholders and restore verbatim', () => {
  const src = 'Gửi cho an.nguyen@acme-demo.example hoặc xem https://portal.acme-demo.example/req/42 theo REQ-2026-0042.';
  const p = P(src);
  assert.equal(p.text, 'Gửi cho <x0> hoặc xem <x1> theo <x2>.');
  assert.deepEqual(
    p.spans.map((s) => s.original),
    ['an.nguyen@acme-demo.example', 'https://portal.acme-demo.example/req/42', 'REQ-2026-0042'],
  );
  assert.equal(restoreSegment(p.text, p.spans, { direction: 'vi-en' }), src);
});

test('code regex covers multi-part codes and does not double-protect inner digits', () => {
  const p = P('Mã HD-2026-15-3 và CC-0042.');
  assert.equal(p.text, 'Mã <x0> và <x1>.');
});

test('numeric dates and amounts are protected (decimal separators intact)', () => {
  const p = P('Hạn báo hủy 15/11/2026, phí 1.500.000 đồng, giảm 12,5%, ngày 01/10.', { glossary: [] });
  assert.equal(p.text, 'Hạn báo hủy <x0>, phí <x1>, giảm <x2>, ngày <x3>.');
  assert.deepEqual(
    p.spans.map((s) => s.original),
    ['15/11/2026', '1.500.000 đồng', '12,5%', '01/10'],
  );
});

test('amount with magnitude word and currency is one span', () => {
  assert.equal(P('Ngân sách 5 triệu đồng.', { glossary: [] }).text, 'Ngân sách <x0>.');
  assert.equal(P('The fee is $1,200.50 per seat.', { direction: 'en-vi', glossary: [] }).text, 'The fee is <x0> per seat.');
  assert.equal(P('Pay 3,000 USD now.', { direction: 'en-vi', glossary: [] }).text, 'Pay <x0> now.');
});

test('numbers glued to letters (Office365, v2) are not split into placeholders', () => {
  assert.equal(P('Cần Office365 và Python3.', { glossary: [] }).text, 'Cần Office365 và Python3.');
});

test('known terms (names, software) are protected, longest first, case-sensitive, whole token', () => {
  const p = P('Nguyễn Văn An cần GitHub Copilot và GitHub, không cần Git.', {
    knownTerms: ['GitHub', 'GitHub Copilot', 'Nguyễn Văn An', 'Git'],
  });
  assert.equal(p.text, '<x0> cần <x1> và <x2>, không cần <x3>.');
  assert.deepEqual(
    p.spans.map((s) => s.original),
    ['Nguyễn Văn An', 'GitHub Copilot', 'GitHub', 'Git'],
  );
  // not inside a longer word
  assert.equal(P('Slackbot ok', { knownTerms: ['Slack'] }).text, 'Slackbot ok');
});

test('the same term twice gets two distinct placeholders', () => {
  const p = P('Figma và Figma', { knownTerms: ['Figma'] });
  assert.equal(p.text, '<x0> và <x1>');
  assert.equal(restoreSegment(p.text, p.spans, { direction: 'vi-en' }), 'Figma và Figma');
});

test('collision: source text that already looks like a placeholder is protected as its own span', () => {
  const src = 'Mã <x0> nằm cạnh REQ-2026-0042 và <x1>.';
  const p = P(src);
  assert.equal(p.text, 'Mã <x0> nằm cạnh <x1> và <x2>.');
  assert.equal(p.spans[0].original, '<x0>');
  assert.equal(p.spans[2].original, '<x1>');
  assert.equal(restoreSegment(p.text, p.spans, { direction: 'vi-en' }), src);
});

test('collision: restore is single pass, a restored value is never re-expanded', () => {
  const p = P('Giá trị <x1> và Figma', { knownTerms: ['Figma'] });
  // translated text happens to keep placeholders swapped
  const out = restoreSegment('Value <x0> and <x1>', p.spans, { direction: 'vi-en' });
  assert.equal(out, 'Value <x1> and Figma');
});

test('glossary vi->en: term replaced by placeholder, restored with English term (capitalisation follows source)', () => {
  const p = P('Trưởng phòng đã duyệt, hạn báo hủy sắp đến.');
  assert.equal(p.text, '<x0> đã duyệt, <x1> sắp đến.');
  assert.equal(restoreSegment('<x0> approved, <x1> is near.', p.spans, { direction: 'vi-en' }), 'Department head approved, cancellation deadline is near.');
});

test('glossary: unaccented Vietnamese multi-word terms are recognised', () => {
  const p = P('Truong phong da duyet, han bao huy la 15/11/2026.');
  assert.equal(p.text, '<x0> da duyet, <x1> la <x2>.');
  assert.equal(p.spans[0].kind, 'glossary');
});

test('glossary: fixed-case role names keep exact casing; keep-terms stay verbatim', () => {
  const p = P('Người duyệt chi xác nhận seat thuộc Cost Center của phòng IT.');
  assert.equal(p.text, '<x0> xác nhận <x1> thuộc <x2> của <x3> IT.');
  const out = restoreSegment('<x0> confirms <x1> belongs to <x2> of <x3> IT.', p.spans, { direction: 'vi-en' });
  assert.equal(out, 'Spending Approver confirms seat belongs to Cost Center of department IT.');
});

test('glossary en->vi: inflected English forms map to one Vietnamese term; keep terms verbatim', () => {
  const opts = { direction: 'en-vi' };
  const p = protectSegment('The department head renewed 3 seats, revoking the old Cost Center.', opts);
  assert.equal(p.text, 'The <x0> <x1> <x2> <x3>, <x4> the old <x5>.');
  const out = restoreSegment('<x0> <x1> <x2> <x3>, <x4> <x5> cũ.', p.spans, opts);
  assert.equal(out, 'trưởng phòng gia hạn 3 seats, thu hồi Cost Center cũ.');
});

test('english target chooses pp / noun / base form from the preceding word', () => {
  const p = P('Quyền sẽ bị thu hồi. Cần thu hồi ngay. Việc gia hạn.');
  const spans = p.spans;
  assert.equal(restoreSegment('Rights will be <x0>.', [spans[0]].map((s, i) => ({ ...s, id: 0 })), { direction: 'vi-en' }), 'Rights will be revoked.');
  assert.equal(restoreSegment('Need to <x0> now.', [{ ...spans[0], id: 0 }], { direction: 'vi-en' }), 'Need to revoke now.');
  assert.equal(restoreSegment('The <x0>.', [{ ...spans[0], id: 0 }], { direction: 'vi-en' }), 'The revocation.');
});

test('textual dates are protected and restored VERBATIM (no date localisation: out of scope)', () => {
  const vi = P('Gia hạn vào ngày 15 tháng 11 năm 2026, hoặc 3 tháng 2.', { glossary: [] });
  assert.equal(vi.text, 'Gia hạn vào <x0>, hoặc <x1>.');
  assert.deepEqual(vi.spans.map((s) => s.original), ['ngày 15 tháng 11 năm 2026', '3 tháng 2']);
  assert.equal(restoreSegment(vi.text, vi.spans, { direction: 'vi-en' }), 'Gia hạn vào ngày 15 tháng 11 năm 2026, hoặc 3 tháng 2.');
  assert.equal(restoreSegment('Renew on <x0> or <x1>.', vi.spans, { direction: 'vi-en' }), 'Renew on ngày 15 tháng 11 năm 2026 or 3 tháng 2.');

  const en = protectSegment('Renew by November 15, 2026 or 3 February.', { direction: 'en-vi', glossary: [] });
  assert.equal(en.text, 'Renew by <x0> or <x1>.');
  assert.deepEqual(en.spans.map((s) => s.original), ['November 15, 2026', '3 February']);
  assert.equal(restoreSegment('Gia hạn trước <x0> hoặc <x1>.', en.spans, { direction: 'en-vi' }), 'Gia hạn trước November 15, 2026 hoặc 3 February.');
  for (const s of [...vi.spans, ...en.spans]) assert.equal(s.value, undefined, 'no localised value is stored');
});

test('the word "May" as a modal verb is not read as a month', () => {
  assert.equal(protectSegment('May I renew it? You may.', { direction: 'en-vi', glossary: [] }).text, 'May I renew it? You may.');
});

test('round trip without model is the identity (source restored verbatim) for plain protected spans', () => {
  const src = 'Yêu cầu REQ-2026-0042 của Trần Thị Bích, email bich.tran@acme-demo.example, 2.000.000 đồng ngày 20/12/2026.';
  assert.equal(roundTrip(src, { knownTerms: ['Trần Thị Bích'], glossary: [] }), src);
});

test('plain-number protection can be disabled', () => {
  assert.equal(P('Cần 3 seat.', { glossary: [], protectNumbers: false }).text, 'Cần 3 seat.');
});

test('checkPlaceholders: exact multiset required', () => {
  const spans = [{ id: 0 }, { id: 1 }];
  assert.deepEqual(checkPlaceholders('a <x0> b <x1>', spans), { ok: true, missing: [], extra: [], duplicated: [] });
  assert.equal(checkPlaceholders('a <x1> b <x0>', spans).ok, true, 'reordering is allowed');
  const missing = checkPlaceholders('a <x0> b', spans);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, [1]);
  const dup = checkPlaceholders('<x0> <x0> <x1>', spans);
  assert.equal(dup.ok, false);
  assert.deepEqual(dup.duplicated, [0]);
  const extra = checkPlaceholders('<x0> <x1> <x2>', spans);
  assert.equal(extra.ok, false);
  assert.deepEqual(extra.extra, [2]);
  assert.equal(checkPlaceholders('< x0 > <x1>', spans).ok, false, 'mangled placeholder counts as missing');
  assert.equal(checkPlaceholders('no placeholders here', []).ok, true);
  assert.equal(checkPlaceholders('<x0> appears from nowhere', []).ok, false);
});

test('isPlaceholderOnly: nothing translatable left', () => {
  assert.equal(isPlaceholderOnly('<x0>'), true);
  assert.equal(isPlaceholderOnly('<x0>, <x1>.'), true);
  assert.equal(isPlaceholderOnly('<x0> đã duyệt'), false);
  assert.equal(isPlaceholderOnly(''), false);
});

test('glossary guard: bare "phòng" is a department only before a capital/digit or at a clause end (not "phòng họp", "phòng thí nghiệm")', () => {
  assert.equal(P('Phòng họp ở tầng 3 và phòng thí nghiệm mới.', { glossary: undefined, protectNumbers: false }).text, 'Phòng họp ở tầng 3 và phòng thí nghiệm mới.');
  assert.equal(P('Chuyển sang phòng Kỹ thuật, phòng IT và phòng 12.', { protectNumbers: false }).text, 'Chuyển sang <x0> Kỹ thuật, <x1> IT và <x2> 12.');
  assert.equal(P('Mọi phòng ban đều phải gia hạn.', { protectNumbers: false }).text, 'Mọi <x0> đều phải <x1>.');
  assert.equal(P('Họ làm ở phòng.', { protectNumbers: false }).text, 'Họ làm ở <x0>.');
});
