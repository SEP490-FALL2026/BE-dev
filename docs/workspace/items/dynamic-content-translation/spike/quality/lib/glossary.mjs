// Bilingual domain glossary (vi <-> en) for the licence-management domain.
//
// Each entry: { id, vi: { match: [...], out }, en: { match: [...], out, pp?, noun? }, fixedCase?, keep? }
//  - `match` are the surface forms recognised in a SOURCE of that language
//    (case-insensitive, whole-word, longest first).
//  - `out` is the term inserted in the TARGET language when restoring a placeholder.
//  - `pp` / `noun` (English only) are alternative forms chosen by a tiny heuristic
//    on the preceding word (aux verb -> past participle, determiner -> noun form),
//    because a placeholder cannot be inflected by the model.
//  - `fixedCase`: never re-capitalise (role names such as "Spending Approver").
//  - `keep`: the term stays as written in the source in both directions
//    (restored verbatim, e.g. "seat", "Cost Center").
//
// vi sources are also matched without diacritics for multi-word terms
// ("truong phong", "han bao huy") because users type unaccented Vietnamese.

export const GLOSSARY = [
  {
    id: 'spending-approver',
    fixedCase: true,
    vi: { match: ['Người duyệt chi'], out: 'Người duyệt chi' },
    en: { match: ['Spending Approvers', 'Spending Approver'], out: 'Spending Approver' },
  },
  {
    id: 'department-head',
    vi: { match: ['trưởng phòng'], out: 'trưởng phòng' },
    en: {
      match: ['heads of department', 'head of department', 'head of the department', 'department heads', 'department head'],
      out: 'department head',
    },
  },
  {
    id: 'cancellation-deadline',
    vi: { match: ['hạn báo hủy', 'hạn báo huỷ'], out: 'hạn báo hủy' },
    en: {
      match: ['cancellation notice deadlines', 'cancellation notice deadline', 'cancellation deadlines', 'cancellation deadline'],
      out: 'cancellation deadline',
    },
  },
  {
    id: 'department',
    // bare "phòng" also means room (phòng họp, phòng thí nghiệm): only treat it as a
    // department before a capital/digit or at a clause end (phòng Kỹ thuật, phòng IT).
    vi: { match: ['phòng ban', { form: 'phòng', nextUpper: true }], out: 'phòng' },
    en: { match: ['departments', 'department'], out: 'department' },
  },
  {
    id: 'renew',
    vi: { match: ['gia hạn'], out: 'gia hạn' },
    en: {
      match: ['renewals', 'renewal', 'renewing', 'renewed', 'renews', 'renew'],
      out: 'renew',
      pp: 'renewed',
      noun: 'renewal',
    },
  },
  {
    id: 'revoke',
    vi: { match: ['thu hồi'], out: 'thu hồi' },
    en: {
      match: ['revocations', 'revocation', 'revoking', 'revoked', 'revokes', 'revoke'],
      out: 'revoke',
      pp: 'revoked',
      noun: 'revocation',
    },
  },
  {
    id: 'hand-over',
    vi: { match: ['bàn giao'], out: 'bàn giao' },
    en: {
      match: ['handing over', 'handed over', 'hands over', 'hand over', 'hand-over', 'handovers', 'handover'],
      out: 'hand over',
      pp: 'handed over',
      noun: 'handover',
    },
  },
  {
    id: 'seat',
    keep: true,
    vi: { match: ['seats', 'seat'] },
    en: { match: ['seats', 'seat'] },
  },
  {
    id: 'cost-center',
    keep: true,
    vi: { match: ['Cost Centers', 'Cost Center', 'Cost Centres', 'Cost Centre'] },
    en: { match: ['Cost Centers', 'Cost Center', 'Cost Centres', 'Cost Centre'] },
  },
];

export function foldDiacritics(s) {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// Compile once per (glossary, direction): [{ entry, regex }] sorted so longer matches win.
export function compileGlossary(glossary, direction) {
  const [srcLang] = direction.split('-');
  const rules = [];
  for (const entry of glossary) {
    const side = entry[srcLang];
    const forms = new Map(); // surface form -> nextUpper flag
    for (const m of side.match) {
      const form = typeof m === 'string' ? m : m.form;
      const nextUpper = typeof m === 'string' ? false : Boolean(m.nextUpper);
      forms.set(form, nextUpper);
      if (srcLang === 'vi' && form.includes(' ')) forms.set(foldDiacritics(form), nextUpper);
    }
    for (const [form, nextUpper] of forms) rules.push({ entry, form, nextUpper });
  }
  rules.sort((a, b) => b.form.length - a.form.length);
  // `nextUpper` is checked by the caller (an /i regex would make \p{Lu} match lower case too).
  return rules.map(({ entry, form, nextUpper }) => ({
    entry,
    nextUpper,
    regex: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(form).replace(/ /gu, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu'),
  }));
}

export const NEXT_UPPER_OK = /^(?:\s*$|\s*[^\p{L}\p{N}\s]|\s+[\p{Lu}\p{N}])/u;
