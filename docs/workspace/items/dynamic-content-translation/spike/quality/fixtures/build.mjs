// Builds fixtures/vi-en.json and fixtures/en-vi.json from fixtures/src/*.mjs.
// Usage: node fixtures/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viEn } from './src/vi-en.mjs';
import { enVi } from './src/en-vi.mjs';
import { heldoutViEn } from './src/heldout-vi-en.mjs';
import { heldoutEnVi } from './src/heldout-en-vi.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const REFERENCE_AUTHOR = 'AI draft by Claude Sonnet — not reviewed by a human; Opus coordinator spot-check pending';

export function buildFixtures() {
  const wrap = (direction, items) => ({
    referenceAuthor: REFERENCE_AUTHOR,
    direction,
    note: 'SYNTHETIC data: invented people, companies, codes; *.example e-mail domains. References are AI drafts, not human gold.',
    items,
  });
  return {
    'vi-en.json': JSON.parse(JSON.stringify(wrap('vi-en', viEn))),
    'en-vi.json': JSON.parse(JSON.stringify(wrap('en-vi', enVi))),
    'heldout-vi-en.json': JSON.parse(JSON.stringify(wrap('vi-en', heldoutViEn))),
    'heldout-en-vi.json': JSON.parse(JSON.stringify(wrap('en-vi', heldoutEnVi))),
  };
}

// One item per line keeps diffs readable and the files small.
export function serialize(fx) {
  const { items, ...head } = fx;
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  return `${headJson},\n  "items": [\n${items.map((i) => '    ' + JSON.stringify(i)).join(',\n')}\n  ]\n}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = buildFixtures();
  for (const [name, fx] of Object.entries(built)) {
    fs.writeFileSync(path.join(here, name), serialize(fx), 'utf8');
    console.log(`wrote ${name}: ${fx.items.length} items`);
  }
}
