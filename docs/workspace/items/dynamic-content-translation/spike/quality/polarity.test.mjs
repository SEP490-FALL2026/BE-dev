import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPolarity, polarityCues } from './lib/polarity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ok = (direction, src, out, msg) => {
  const r = checkPolarity(src, out, direction);
  assert.equal(r.ok, true, `${msg ?? ''} expected ok: ${JSON.stringify(r)}`);
};
const miss = (direction, src, out, classes, msg) => {
  const r = checkPolarity(src, out, direction);
  assert.equal(r.ok, false, `${msg ?? ''} expected a miss: ${JSON.stringify(r)}`);
  assert.deepEqual(r.missing.sort(), [...classes].sort(), msg);
};
const classesOf = (text, lang) => Object.keys(polarityCues(text, lang)).sort();

test('the module is independent of the fixtures (no fixture field names or ids in its source)', () => {
  const src = fs.readFileSync(path.join(here, 'lib', 'polarity.mjs'), 'utf8');
  assert.ok(!/mustContain|mustNotContain|\breference\b|fixtures|vi-0\d\d|en-0\d\d/.test(src));
});

// ---- classification ----------------------------------------------------------------------------------------------------
test('cue classes: vi', () => {
  assert.deepEqual(classesOf('Tôi đã duyệt yêu cầu.', 'vi'), ['approve']);
  assert.deepEqual(classesOf('Ban giám đốc tán thành kế hoạch.', 'vi'), ['approve']);
  assert.deepEqual(classesOf('Yêu cầu bị từ chối.', 'vi'), ['reject']);
  assert.deepEqual(classesOf('Yêu cầu chưa được duyệt.', 'vi'), ['reject'], 'not-approved is one reject cue, not negation + approve');
  assert.deepEqual(classesOf('Hãy thu hồi quyền truy cập.', 'vi'), ['revoke']);
  assert.deepEqual(classesOf('Đừng chia sẻ mật khẩu.', 'vi'), ['negation']);
  assert.deepEqual(classesOf('Không thu hồi tài khoản.', 'vi'), ['negation', 'revoke']);
  assert.deepEqual(classesOf('Cần cài đặt phần mềm.', 'vi'), []);
});

test('cue classes: en', () => {
  assert.deepEqual(classesOf('The board endorsed the plan.', 'en'), ['approve']);
  assert.deepEqual(classesOf('We grant access to the team.', 'en'), ['approve']);
  assert.deepEqual(classesOf('The request was turned down.', 'en'), ['reject']);
  assert.deepEqual(classesOf('The request has not been approved.', 'en'), ['reject']);
  assert.deepEqual(classesOf("We can't approve this.", 'en'), ['reject']);
  assert.deepEqual(classesOf('The admin withdrew access.', 'en'), ['revoke']);
  assert.deepEqual(classesOf("Don't share the password.", 'en'), ['negation']);
  assert.deepEqual(classesOf('Nobody objected and nothing changed.', 'en'), ['negation']);
  assert.deepEqual(classesOf('Do not revoke the account.', 'en'), ['negation', 'revoke']);
  assert.deepEqual(classesOf('Install the tool.', 'en'), []);
});

test('word boundaries and neutral compounds do not trigger cues', () => {
  assert.deepEqual(classesOf('Tệp chứa dữ liệu.', 'vi'), [], 'chứa is not chưa');
  assert.deepEqual(classesOf('Không gian làm việc mới.', 'vi'), [], 'workspace is not a negation');
  assert.deepEqual(classesOf('Đặt vé hàng không.', 'vi'), []);
  assert.deepEqual(classesOf('Bạn có thể giúp không?', 'vi'), [], 'tag question "... không?" is not a negation');
  assert.deepEqual(classesOf('Đã xong chưa?', 'vi'), []);
  assert.deepEqual(classesOf('Đã duyệt chưa?', 'vi'), ['approve'], 'the question particle is blanked, the approve cue stays');
  assert.deepEqual(classesOf('Tôi không giúp được?', 'vi'), ['negation'], 'only a particle directly before the question mark is neutral');
  assert.deepEqual(classesOf('We know the answer, note the nominee.', 'en'), [], 'no inside know/note/nominee');
  assert.deepEqual(classesOf('Not only the team but also the vendor.', 'en'), []);
});

test('unaccented Vietnamese is read with folded cues; ambiguous ones stay off', () => {
  assert.deepEqual(classesOf('Yeu cau chua duoc duyet.', 'vi'), ['reject']);
  assert.deepEqual(classesOf('Truong phong tu choi yeu cau.', 'vi'), ['reject']);
  assert.deepEqual(classesOf('Toi khong can cai them.', 'vi'), ['negation']);
  assert.deepEqual(classesOf('Thu hoi quyen truy cap.', 'vi'), ['revoke']);
  assert.deepEqual(classesOf('Dung chia se mat khau.', 'vi'), [], 'dung is ambiguous (nội dung): not used when unaccented');
});

// ---- vi -> en ------------------------------------------------------------------------------------------------------------
test('vi->en: same-class cues pass, flips are caught', () => {
  ok('vi-en', 'Yêu cầu của anh ấy chưa được duyệt.', 'His request has not been approved.');
  ok('vi-en', 'Yêu cầu của anh ấy chưa được duyệt.', 'His request was rejected.');
  miss('vi-en', 'Yêu cầu của anh ấy chưa được duyệt.', 'His request has been approved.', ['reject']);
  ok('vi-en', 'Tôi không thể duyệt đề xuất này.', 'I cannot approve this proposal.');
  miss('vi-en', 'Tôi không thể duyệt đề xuất này.', 'I approve this proposal.', ['reject']);
  ok('vi-en', 'Đề xuất bị từ chối.', 'The proposal was declined.');
  ok('vi-en', 'Đề xuất bị từ chối.', 'The proposal was turned down.');
  miss('vi-en', 'Đề xuất bị từ chối.', 'The proposal was approved.', ['reject']);
});

test('vi->en: new phrasings and synonyms', () => {
  ok('vi-en', 'Ban giám đốc tán thành kế hoạch.', 'The board endorsed the plan.');
  ok('vi-en', 'Ban giám đốc tán thành kế hoạch.', 'The board approved the plan.');
  ok('vi-en', 'Ban giám đốc chấp nhận kế hoạch.', 'The board accepted the plan.');
  miss('vi-en', 'Ban giám đốc tán thành kế hoạch.', 'The board postponed the plan.', ['approve']);
  ok('vi-en', 'Quản trị viên đã rút quyền truy cập.', 'The admin withdrew access.');
  ok('vi-en', 'Quản trị viên đã hủy quyền truy cập.', 'The admin revoked the access.');
  miss('vi-en', 'Quản trị viên đã rút quyền truy cập.', 'The admin granted access.', ['revoke']);
  ok('vi-en', 'Đừng chia sẻ mật khẩu.', "Don't share the password.");
  ok('vi-en', 'Chớ chia sẻ mật khẩu.', 'Never share the password.');
  miss('vi-en', 'Đừng chia sẻ mật khẩu.', 'Share the password.', ['negation']);
  ok('vi-en', 'Công ty chẳng có ngân sách.', 'The company has no budget.');
  ok('vi-en', 'Không gian làm việc mới.', 'The new workspace.', 'neutral compound');
});

test('vi->en: several classes in one segment all have to be covered', () => {
  ok('vi-en', 'Không thu hồi tài khoản trước khi bàn giao.', 'Do not revoke the account before the handover.');
  miss('vi-en', 'Không thu hồi tài khoản trước khi bàn giao.', 'Revoke the account before the handover.', ['negation']);
  miss('vi-en', 'Không thu hồi tài khoản trước khi bàn giao.', 'Do not keep the account before the handover.', ['revoke']);
});

test('vi->en: unaccented source', () => {
  ok('vi-en', 'Yeu cau chua duoc duyet vi thieu ly do.', 'The request has not been approved because the reason is missing.');
  miss('vi-en', 'Yeu cau chua duoc duyet vi thieu ly do.', 'The sour lemur lecom permort because of the tiet.', ['reject']);
  miss('vi-en', 'Truong phong tu choi yeu cau.', 'Department head tui yeu suu.', ['reject']);
});

// ---- en -> vi ------------------------------------------------------------------------------------------------------------
test('en->vi: same-class cues pass, flips are caught', () => {
  ok('en-vi', 'The request was not approved.', 'Yêu cầu không được duyệt.');
  ok('en-vi', 'The request was not approved.', 'Yêu cầu bị từ chối.');
  miss('en-vi', 'The request was not approved.', 'Yêu cầu đã được duyệt.', ['reject']);
  ok('en-vi', 'We approve the proposal.', 'Chúng tôi phê duyệt đề xuất.');
  ok('en-vi', 'We agree with the proposal.', 'Chúng tôi đồng ý với đề xuất.');
  miss('en-vi', 'We approve the proposal.', 'Chúng tôi từ chối đề xuất.', ['approve']);
});

test('en->vi: synonyms and grant', () => {
  ok('en-vi', 'We grant access to the team.', 'Chúng tôi cấp quyền cho nhóm.');
  ok('en-vi', 'Management endorses the plan.', 'Ban quản lý tán thành kế hoạch.');
  miss('en-vi', 'We grant access to the team.', 'Chúng tôi chia sẻ với nhóm.', ['approve']);
  ok('en-vi', 'The admin will revoke the key.', 'Quản trị viên sẽ thu hồi khóa.');
  ok('en-vi', 'The admin will remove access for the user.', 'Quản trị viên sẽ gỡ quyền của người dùng.');
  miss('en-vi', 'The admin will revoke the key.', 'Quản trị viên sẽ tạo khóa.', ['revoke']);
  ok('en-vi', 'Never share the key.', 'Đừng bao giờ chia sẻ khóa.');
  ok('en-vi', 'No seat is available.', 'Không còn seat nào.');
  ok('en-vi', 'Nobody objected.', 'Không ai phản đối.');
  miss('en-vi', 'The tool is not in the catalogue.', 'Công cụ có trong danh mục.', ['negation']);
  ok('en-vi', 'Do not revoke the account.', 'Không thu hồi tài khoản.');
  miss('en-vi', 'Do not revoke the account.', 'Thu hồi tài khoản.', ['negation']);
});

test('en->vi: rejection wording', () => {
  ok('en-vi', 'The proposal was turned down.', 'Đề xuất bị bác bỏ.');
  ok('en-vi', 'We declined the offer.', 'Chúng tôi từ chối lời đề nghị.');
  ok('en-vi', 'Access denied.', 'Truy cập bị từ chối.');
  miss('en-vi', 'We declined the offer.', 'Chúng tôi nhận lời đề nghị.', ['reject']);
});

// ---- rule shape --------------------------------------------------------------------------------------------------------
test('only cues in the SOURCE are required; cues that appear only in the output are not penalised', () => {
  ok('vi-en', 'Cần cài đặt phần mềm.', 'The software must not be installed.', 'hallucinated negation is out of scope for a cue-presence rule');
  ok('vi-en', 'Cần cài đặt phần mềm.', 'Install the software.');
});

test('the result explains itself', () => {
  const r = checkPolarity('Không thu hồi tài khoản.', 'Revoke the account.', 'vi-en');
  assert.deepEqual(r.required.sort(), ['negation', 'revoke']);
  assert.deepEqual(r.missing, ['negation']);
  assert.deepEqual(Object.keys(r.outputCues), ['revoke']);
});

test('documented trade-offs: a valid paraphrase without a lexicon cue is a false fallback; a cue attached to the wrong clause is a miss', () => {
  // false fallback: 'ủng hộ' means support, the model's wording is fine but not in the lexicon
  miss('en-vi', 'We approve the proposal.', 'Chúng tôi ủng hộ đề xuất.', ['approve']);
  // miss: both cues present, polarity attached to the wrong verb
  ok('vi-en', 'Không thu hồi tài khoản.', 'Revoke the account, do not keep it.', 'known miss: the gate checks presence, not scope');
});

test('empty and non-string input is safe', () => {
  ok('vi-en', '', '');
  ok('vi-en', 'Xong.', '');
  assert.throws(() => checkPolarity('a', 'b', 'xx-yy'));
});

// ---- bugs found by the first 4.3.1 run (kept as regression tests) -----------------------------------------------------------
test('BUG-1: "revocation" (c, not k) is a revoke cue, trigger and satisfier', () => {
  assert.deepEqual(classesOf('The revocation of access was scheduled.', 'en'), ['revoke']);
  assert.deepEqual(classesOf('Revocations are logged.', 'en'), ['revoke']);
  ok('en-vi', 'Revocation of the old key is scheduled.', 'Việc thu hồi khóa cũ đã được lên lịch.');
  // glossary noun form after a determiner ("không <thu hồi>" restored as "no revocation") satisfies the revoke class
  ok('vi-en', 'Không thu hồi seat.', 'No revocation of the seat.');
});

test('BUG-2: allow/permit/authorise/sanction are approve satisfiers only; "not allowed" / "does not allow" stay negation, not reject', () => {
  assert.deepEqual(classesOf("The system doesn't allow exceptions.", 'en'), ['negation']);
  assert.deepEqual(classesOf('Sharing an account is not allowed.', 'en'), ['negation']);
  assert.deepEqual(classesOf('We do not permit it and cannot authorise it.', 'en'), ['negation']);
  ok('vi-en', 'Chính sách không cho phép ngoại lệ.', "The policy doesn't allow exceptions.");
  ok('vi-en', 'Không được phép chia sẻ tài khoản.', 'Sharing the account is not allowed.');
  // approve-trigger verbs still form the reject compound
  assert.deepEqual(classesOf('The request has not been approved.', 'en'), ['reject']);
  assert.deepEqual(classesOf("We can't accept it.", 'en'), ['reject']);
});
