// chrF (Popovic 2015) with sacreBLEU CHRF defaults:
// char_order=6, word_order=0, beta=2, whitespace removed, case-sensitive,
// no epsilon smoothing (orders without n-grams are skipped, as in sacreBLEU 2.x).
// Characters are Unicode code points (not UTF-16 units), NFC-normalised first.

export const CHRF_DEFAULTS = Object.freeze({ order: 6, beta: 2 });

function toChars(str) {
  return Array.from(String(str).normalize('NFC').replace(/\s+/gu, ''));
}

export function charNgrams(str, n) {
  const chars = toChars(str);
  const counts = new Map();
  for (let i = 0; i + n <= chars.length; i++) {
    const g = chars.slice(i, i + n).join('');
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  return counts;
}

// Per-order statistics [nHyp, nRef, nMatch] for one sentence pair.
export function sentenceStats(hyp, ref, order = CHRF_DEFAULTS.order) {
  const stats = [];
  for (let n = 1; n <= order; n++) {
    const h = charNgrams(hyp, n);
    const r = charNgrams(ref, n);
    let nHyp = 0;
    let nRef = 0;
    let nMatch = 0;
    for (const c of h.values()) nHyp += c;
    for (const c of r.values()) nRef += c;
    for (const [g, c] of h) nMatch += Math.min(c, r.get(g) || 0);
    stats.push([nHyp, nRef, nMatch]);
  }
  return stats;
}

export function addStats(a, b) {
  return a.map((row, i) => [row[0] + b[i][0], row[1] + b[i][1], row[2] + b[i][2]]);
}

export function scoreFromStats(stats, beta = CHRF_DEFAULTS.beta) {
  const factor = beta * beta;
  let avgPrec = 0;
  let avgRec = 0;
  let effective = 0;
  for (const [nHyp, nRef, nMatch] of stats) {
    if (nHyp > 0 && nRef > 0) {
      avgPrec += nMatch / nHyp;
      avgRec += nMatch / nRef;
      effective += 1;
    }
  }
  if (effective === 0) return 0;
  avgPrec /= effective;
  avgRec /= effective;
  if (avgPrec + avgRec === 0) return 0;
  return (100 * (1 + factor) * avgPrec * avgRec) / (factor * avgPrec + avgRec);
}

export function sentenceChrF(hyp, ref, opts = {}) {
  const { order = CHRF_DEFAULTS.order, beta = CHRF_DEFAULTS.beta } = opts;
  return scoreFromStats(sentenceStats(hyp, ref, order), beta);
}

// Corpus-level chrF: n-gram statistics are summed over all pairs, then scored once.
export function corpusChrF(hyps, refs, opts = {}) {
  if (hyps.length !== refs.length) {
    throw new Error(`corpusChrF: length mismatch (${hyps.length} hypotheses vs ${refs.length} references)`);
  }
  const { order = CHRF_DEFAULTS.order, beta = CHRF_DEFAULTS.beta } = opts;
  let total = Array.from({ length: order }, () => [0, 0, 0]);
  for (let i = 0; i < hyps.length; i++) total = addStats(total, sentenceStats(hyps[i], refs[i], order));
  return scoreFromStats(total, beta);
}
