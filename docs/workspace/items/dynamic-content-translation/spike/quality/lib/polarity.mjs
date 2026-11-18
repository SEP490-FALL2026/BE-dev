// Polarity gate (pure). A DETECTION HEURISTIC, not a meaning guarantee.
//
// Four classes: negation, approve, reject, revoke. For every class whose cue appears in the SOURCE, the OUTPUT must
// contain a cue of the same class (in the target language); otherwise the caller falls back (reason QUALITY_GATE).
//
// Design (documented trade-offs, see README):
//  * Two lexicons per language. TRIGGER cues decide what the source requires and are kept narrow (few false triggers).
//    The OUTPUT is scanned with the trigger cues plus extra satisfier cues (synonyms such as "endorse", "gỡ quyền"),
//    so that valid paraphrases are not rejected.
//  * Longest-pattern-first masking: compound cues are matched first and blanked out, so one phrase counts once.
//    "chưa được duyệt" / "has not been approved" are ONE reject cue (not negation + approve), which keeps the two
//    sides symmetric. A flip such as "approved" -> "not approved" is caught because the output then has reject, not approve.
//  * Neutral compounds are blanked out first ("không gian" = space, "hàng không" = aviation, "not only").
//  * Unaccented Vietnamese is read with diacritic-folded cues, except cues that collide with common words once folded.
//  * It checks the PRESENCE of a cue, not its scope: a cue attached to the wrong clause still passes (known miss), and a
//    correct paraphrase without a lexicon cue falls back (known false fallback).
//  * Deliberately independent of any fixture: no fixture field, id or sentence is referenced here.
import { foldDiacritics } from './glossary.mjs';

export const POLARITY_CLASSES = ['negation', 'approve', 'reject', 'revoke'];

const NEG_EN = "(?:not|never|cannot|\\p{L}*n['’]t)";
const AUX_EN = '(?:\\s+(?:be|been|being|yet|ever|currently|automatically|formally|fully|get|got|to))*';
// TRIGGER verbs only: the negated-approve compound must not swallow "not allowed" / "doesn't allow" (those are negation;
// allow/permit/authorise/sanction are approve SATISFIERS only, see the entries below).
const APPROVE_VERB_EN =
  '(?:approv(?:e|es|ed|ing|al|als|er|ers)|accept(?:s|ed|ing|ance|able)?|agree(?:s|d|ing)?|endors(?:e|es|ed|ing|ement)|grant(?:s|ed|ing)?)';
const NEG_VI = '(?:không|chưa|chẳng|chả)';
const APPROVE_VERB_VI = '(?:(?:phê\\s+)?duyệt|chấp\\s+thuận|chấp\\s+nhận|đồng\\s+ý|tán\\s+thành|phê\\s+chuẩn)';

// [class|null (neutral), pattern, trigger]. ORDER MATTERS: earlier entries blank their match for later ones.
const EN = [
  [null, 'not\\s+only|whether\\s+or\\s+not', true],
  // compound rejections: negated approve-like verb, or inability / failure to approve
  ['reject', `(?:${NEG_EN}|unable\\s+to|fail(?:s|ed|ing)?\\s+to)${AUX_EN}\\s+${APPROVE_VERB_EN}`, true],
  [
    'reject',
    'disapprov\\w*|disagree(?:s|d|ing)?|unapproved|reject\\w*|declin(?:e|es|ed|ing)|den(?:y|ies|ied|ying)|refus(?:e|es|ed|ing|al)|turn(?:s|ed|ing)?\\s+down|veto(?:es|ed|ing)?',
    true,
  ],
  ['revoke', 'revok(?:e|es|ed|ing)|revocations?|rescind(?:s|ed|ing)?', true],
  [
    'revoke',
    'withdr(?:aw|aws|awing|ew|awn|awal)\\s+(?:\\p{L}+\\s+){0,2}(?:access|permissions?|rights|privileges?|licen[sc]es?|seats?)',
    true,
  ],
  ['revoke', 'remov(?:e|es|ed|ing|al)\\s+(?:\\p{L}+\\s+){0,2}(?:access|permissions?|rights|privileges?)', true],
  [
    'revoke',
    'withdr(?:aw|aws|awing|ew|awn|awal)|remov(?:e|es|ed|ing|al)|terminat(?:e|es|ed|ing)|deactivat(?:e|es|ed|ing)|reclaim(?:s|ed|ing)?',
    false,
  ],
  [
    'approve',
    'approv(?:e|es|ed|ing|al|als|er|ers)|accept(?:s|ed|ing|ance|able)?|agree(?:s|d|ing)?|endors(?:e|es|ed|ing|ement)|grant(?:s|ed|ing)?|sign(?:s|ed|ing)?\\s+off',
    true,
  ],
  [
    'approve',
    'allow(?:s|ed|ing)?|permit(?:s|ted|ting)?|authori[sz](?:e|es|ed|ing)|sanction(?:s|ed|ing)?|consent(?:s|ed|ing)?|green-?light(?:s|ed|ing)?',
    false,
  ],
  ['negation', "not|never|cannot|\\p{L}*n['’]t|no|none|nobody|nothing|nowhere|neither|nor|without", true],
  [
    'negation',
    'unable|unavailable|inability|lack(?:s|ed|ing)?|missing|absent|fail(?:s|ed|ing|ure)?|prohibit\\w*|forbid\\w*|forbidden',
    false,
  ],
];

const VI = [
  // neutral: space, air, aviation, "not only", and the tag-question particle at the end of a question ("... không?")
  [null, 'không\\s+(?:gian|khí|quân|lưu|trung|chỉ)|hàng\\s+không|(?:không|chưa)\\s*\\?', true],
  ['reject', `${NEG_VI}\\s+(?:(?:được|thể|hề|còn)\\s+)*${APPROVE_VERB_VI}`, true],
  ['reject', 'từ\\s+chối|bác\\s+bỏ|bác\\s+đơn|khước\\s+từ|phủ\\s+quyết', true],
  [
    'revoke',
    'thu\\s+hồi|rút\\s+quyền|hủy\\s+quyền|huỷ\\s+quyền|tước\\s+quyền|thu\\s+lại\\s+quyền|gỡ\\s+quyền|xóa\\s+quyền|xoá\\s+quyền',
    true,
  ],
  [
    'revoke',
    'gỡ\\s+bỏ|thu\\s+lại|rút\\s+lại|tước|vô\\s+hiệu\\s+hóa|vô\\s+hiệu\\s+hoá|chấm\\s+dứt',
    false,
    'go\\s+bo|thu\\s+lai|rut\\s+lai|vo\\s+hieu\\s+hoa|cham\\s+dut',
  ],
  ['approve', APPROVE_VERB_VI, true],
  [
    'approve',
    'cấp\\s+(?:quyền|phép|thêm)|cho\\s+phép|ủy\\s+quyền|uỷ\\s+quyền|cấp',
    false,
    'cap\\s+(?:quyen|phep|them)|cho\\s+phep|uy\\s+quyen',
  ],
  // folded đừng/chớ/chẳng/chả would collide with dung/cho/chang/cha: only không/chưa are read when unaccented
  ['negation', `${NEG_VI}(?:\\s+thể)?|đừng|chớ`, true, 'khong(?:\\s+the)?|chua(?:\\s+the)?'],
  ['negation', 'thiếu|cấm|bất\\s+khả', false],
];

// [class|null, pattern, trigger, foldedPattern?]  ->  compiled entries; the folded set is used for unaccented text.
const WORD = (src) => `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
const compile = (entries, fold) =>
  entries.map(([cls, src, trigger, foldSrc]) => {
    const s = fold ? (foldSrc ?? foldDiacritics(src)) : src;
    return { cls, trigger, re: new RegExp(WORD(s.normalize('NFC')), 'giu') };
  });

const SETS = { en: compile(EN, false), vi: compile(VI, false), viFolded: compile(VI, true) };

const nfc = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .toLowerCase();

/** Cues found by class: { negation: ['không'], ... } (only classes that occurred). triggersOnly: source semantics. */
export function polarityCues(text, lang, { triggersOnly = true } = {}) {
  let work = nfc(text);
  let set;
  if (lang === 'vi') set = foldDiacritics(work) === work ? SETS.viFolded : SETS.vi;
  else if (lang === 'en') set = SETS.en;
  else throw new Error(`unsupported language ${lang}`);
  if (lang === 'vi' && set === SETS.viFolded) work = foldDiacritics(work);
  const found = {};
  for (const { cls, trigger, re } of set) {
    if (triggersOnly && !trigger) continue;
    work = work.replace(re, (m) => {
      if (cls) (found[cls] ??= []).push(m.replace(/\s+/g, ' ').trim());
      return ' '.repeat(m.length);
    });
  }
  return found;
}

/**
 * checkPolarity(source, output, 'vi-en' | 'en-vi') -> { ok, required, missing, sourceCues, outputCues }
 * required = classes triggered in the source; missing = required classes with no cue in the output.
 */
export function checkPolarity(source, output, direction) {
  const m = /^(vi|en)-(vi|en)$/.exec(String(direction));
  if (!m || m[1] === m[2]) throw new Error(`unsupported direction ${direction}`);
  const [, srcLang, tgtLang] = m;
  const sourceCues = polarityCues(source, srcLang, { triggersOnly: true });
  const outputCues = polarityCues(output, tgtLang, { triggersOnly: false });
  const required = Object.keys(sourceCues);
  const missing = required.filter((c) => !outputCues[c]);
  return { ok: missing.length === 0, required, missing, sourceCues, outputCues };
}
