// Compares two probe-quality evidence files (same inputs, different library versions)
// and writes a per-sentence identical/different table. Not a quality evaluation.
// Usage: node compare-parity.mjs evidence/t381-probe-quality-win32.json evidence/t431-probe-quality-win32.json [out.json]
import fs from 'node:fs';

const [aPath, bPath, outPath] = process.argv.slice(2);
const a = JSON.parse(fs.readFileSync(aPath, 'utf8'));
const b = JSON.parse(fs.readFileSync(bPath, 'utf8'));
const rows = [];
const summary = {};
for (const dir of ['vi-en', 'en-vi']) {
  const keys = dir === 'en-vi' ? ['default', 'noPrefix'] : ['default'];
  for (const key of keys) {
    summary[`${dir}/${key}`] = { identical: 0, different: 0 };
  }
  a.results[dir].items.forEach((ia, i) => {
    const ib = b.results[dir].items[i];
    for (const key of keys) {
      const same = ia.outputs[key] === ib.outputs[key];
      summary[`${dir}/${key}`][same ? 'identical' : 'different']++;
      rows.push({
        dir,
        variant: key,
        input: ia.input,
        [`${a.label}`]: ia.outputs[key],
        [`${b.label}`]: ib.outputs[key],
        identical: same,
        sourceTokenIdsIdentical:
          JSON.stringify(key === 'noPrefix' ? ia.sourceTokenIdsNoPrefix : ia.sourceTokenIds) ===
          JSON.stringify(key === 'noPrefix' ? ib.sourceTokenIdsNoPrefix : ib.sourceTokenIds),
      });
    }
  });
}
const out = { a: { label: a.label, version: a.version }, b: { label: b.label, version: b.version }, summary, rows };
const json = JSON.stringify(out, null, 2) + '\n';
if (outPath) fs.writeFileSync(outPath, json);
console.log(JSON.stringify(summary));
