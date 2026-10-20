// Spike-grade sentence segmenter (the product's segmenter is a separate Step 1 deliverable).
// Splits after . ! ? … followed by whitespace; over-long sentences are split at whitespace; a token longer than
// maxChars is hard-cut. Never returns empty segments. Translate segment arrays (batched), never whole paragraphs.
export function splitSentences(text, { maxChars = 400 } = {}) {
  const trimmed = String(text).trim();
  if (!trimmed) return [];
  const sentences = trimmed
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const s of sentences) {
    if (s.length <= maxChars) {
      out.push(s);
      continue;
    }
    let cur = '';
    for (const word of s.split(/\s+/)) {
      if (word.length > maxChars) {
        if (cur) out.push(cur);
        cur = '';
        for (let i = 0; i < word.length; i += maxChars) out.push(word.slice(i, i + maxChars));
        continue;
      }
      if (!cur) cur = word;
      else if (cur.length + 1 + word.length <= maxChars) cur += ' ' + word;
      else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export const joinSegments = (parts) => parts.join(' ');
