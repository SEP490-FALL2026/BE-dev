// Diagnostic probe (NOT a quality evaluation): same local q8 models, same inputs,
// several generation settings, so outputs can be diffed between transformers.js versions.
// Also prints the source token ids of each input so a tokenizer difference can be ruled in/out.
// Env: SPIKE_MODELS_DIR, SPIKE_OUT, SPIKE_LABEL. Copied into the scratch project by setup-candidate.mjs.
import fs from 'node:fs';
import path from 'node:path';

const tf = await import('@huggingface/transformers');
const { env, pipeline } = tf;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = false;
env.localModelPath = path.resolve(process.env.SPIKE_MODELS_DIR).replace(/\\/g, '/').replace(/\/?$/, '/');

const INPUTS = {
  'vi-en': [
    'Giấy phép phần mềm sẽ hết hạn vào cuối tháng này.',
    'Vui lòng liên hệ bộ phận hỗ trợ để gia hạn.',
    'Nhân viên mới cần được cấp quyền truy cập vào hệ thống quản lý giấy phép.',
    'Hóa đơn tháng mười đã được gửi qua email cho khách hàng.',
    'Gói dịch vụ doanh nghiệp bao gồm năm mươi giấy phép người dùng.',
    'Quản trị viên có thể thu hồi giấy phép của nhân viên đã nghỉ việc.',
    'Xin chào, tôi muốn đổi mật khẩu của tài khoản.',
    'Hợp đồng sẽ được gia hạn tự động nếu không có thông báo hủy.',
    'Báo cáo sử dụng phần mềm được cập nhật hàng tuần.',
    'Thiết bị này đã đạt đến số lượng kích hoạt tối đa.',
  ],
  'en-vi': [
    'The license will expire at the end of this month.',
    'Please contact support to renew your subscription.',
    'New employees must be granted access to the license management system.',
    'The October invoice has been emailed to the customer.',
    'The enterprise plan includes fifty user licenses.',
    'An administrator can revoke the license of an employee who has left.',
    'Hello, I would like to change my account password.',
    'The contract renews automatically unless a cancellation notice is given.',
    'The software usage report is updated every week.',
    'This device has reached the maximum number of activations.',
  ],
};
const SETTINGS = { default: {}, beams4: { num_beams: 4, do_sample: false }, greedy: { num_beams: 1, do_sample: false } };

const out = { label: process.env.SPIKE_LABEL || null, version: env.version ?? null, results: {} };
for (const dir of ['vi-en', 'en-vi']) {
  const tr = await pipeline('translation', `Xenova/opus-mt-${dir}`, { dtype: 'q8', device: 'cpu' });
  out.results[dir] = { generationConfig: tr.model?.generation_config ?? null, items: [] };
  for (const raw of INPUTS[dir]) {
    const text = dir === 'en-vi' ? `>>vie<< ${raw}` : raw;
    const item = { input: text, outputs: {} };
    try {
      const enc = await tr.tokenizer(text);
      item.sourceTokenIds = Array.from(enc.input_ids.data ?? enc.input_ids, Number);
    } catch (e) {
      item.sourceTokenIdsError = String(e).slice(0, 120);
    }
    for (const [name, opts] of Object.entries(SETTINGS)) {
      try {
        const o = await tr(text, { max_new_tokens: 128, ...opts });
        item.outputs[name] = o[0].translation_text;
      } catch (e) {
        item.outputs[name] = `ERROR ${String(e).slice(0, 120)}`;
      }
    }
    if (dir === 'en-vi') {
      // control: same sentence WITHOUT the >>vie<< prefix
      try {
        const enc = await tr.tokenizer(raw);
        item.sourceTokenIdsNoPrefix = Array.from(enc.input_ids.data ?? enc.input_ids, Number);
        item.outputs.noPrefix = (await tr(raw, { max_new_tokens: 128 }))[0].translation_text;
      } catch (e) {
        item.outputs.noPrefix = `ERROR ${String(e).slice(0, 120)}`;
      }
    }
    out.results[dir].items.push(item);
  }
  if (typeof tr.dispose === 'function') await tr.dispose();
}
const json = JSON.stringify(out, null, 2) + '\n';
if (process.env.SPIKE_OUT) fs.writeFileSync(process.env.SPIKE_OUT, json);
else process.stdout.write(json);
process.exit(0);
