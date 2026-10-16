import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMeaning, checkPreservation } from './lib/metrics.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', name), 'utf8'));

const ALLOWED = ['negation', 'approve', 'reject', 'revoke', 'name', 'number', 'date', 'software', 'email', 'code', 'glossary', 'long', 'collision', 'unaccented', 'mixed', 'plain'];
const MIN = { negation: 10, approve: 8, reject: 8, revoke: 6, name: 10, number: 8, date: 8, software: 10, email: 3, code: 4, glossary: 6, long: 4, collision: 3, mixed: 3 };
const REF_AUTHOR = 'AI draft by Claude Sonnet — not reviewed by a human; Opus coordinator spot-check pending';

for (const [file, direction] of [['vi-en.json', 'vi-en'], ['en-vi.json', 'en-vi']]) {
  const fx = load(file);
  const items = fx.items;

  test(`${file}: top level declares the AI-draft reference caveat and direction`, () => {
    assert.equal(fx.referenceAuthor, REF_AUTHOR);
    assert.equal(fx.direction, direction);
    assert.ok(items.length >= 60, `only ${items.length} items`);
  });

  test(`${file}: items are well formed with unique ids`, () => {
    const ids = new Set();
    for (const it of items) {
      assert.ok(!ids.has(it.id), `duplicate id ${it.id}`);
      ids.add(it.id);
      for (const k of ['source', 'reference']) assert.equal(typeof it[k], 'string', `${it.id}.${k}`);
      assert.ok(it.source.length > 0 && it.reference.length > 0, it.id);
      assert.ok(Array.isArray(it.categories) && it.categories.length > 0, it.id);
      for (const c of it.categories) assert.ok(ALLOWED.includes(c), `${it.id}: unknown category ${c}`);
      assert.ok(Array.isArray(it.protected) && Array.isArray(it.mustContain) && Array.isArray(it.mustNotContain), it.id);
    }
  });

  test(`${file}: category coverage minimums`, () => {
    const count = (c) => items.filter((i) => i.categories.includes(c)).length;
    for (const [cat, min] of Object.entries(MIN)) assert.ok(count(cat) >= min, `${cat}: ${count(cat)} < ${min}`);
    if (direction === 'vi-en') assert.ok(count('unaccented') >= 4, `unaccented ${count('unaccented')}`);
  });

  test(`${file}: protected strings occur verbatim in source and reference`, () => {
    for (const it of items) {
      for (const p of it.protected) {
        assert.ok(it.source.includes(p), `${it.id}: "${p}" not in source`);
        assert.ok(it.reference.includes(p), `${it.id}: "${p}" not in reference`);
      }
    }
  });

  test(`${file}: the reference translation passes its own meaning and preservation checks`, () => {
    for (const it of items) {
      const m = checkMeaning(it.reference, it);
      assert.ok(m.pass, `${it.id}: reference fails ${JSON.stringify(m)}`);
      assert.ok(checkPreservation(it.reference, it.protected).all, it.id);
    }
  });

  test(`${file}: collision items literally contain placeholder-looking text; long items are single long sentences`, () => {
    for (const it of items.filter((i) => i.categories.includes('collision'))) {
      assert.match(it.source, /<x\d+>/, it.id);
    }
    for (const it of items.filter((i) => i.categories.includes('long'))) {
      assert.ok(it.source.length > 400, `${it.id} too short`);
      assert.ok(!/[.!?]\s+\p{Lu}/u.test(it.source), `${it.id} must be one sentence`);
    }
  });

  test(`${file}: synthetic data only (example domains, no other e-mail addresses)`, () => {
    const emailRe = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
    for (const it of items) {
      for (const text of [it.source, it.reference]) {
        for (const e of text.match(emailRe) || []) assert.ok(/\.example$/.test(e), `${it.id}: ${e}`);
      }
    }
  });
}

test('fixtures are in sync with fixtures/src (run `node fixtures/build.mjs`)', async () => {
  const { buildFixtures } = await import('./fixtures/build.mjs');
  const built = buildFixtures();
  assert.deepEqual(built['vi-en.json'], load('vi-en.json'));
  assert.deepEqual(built['en-vi.json'], load('en-vi.json'));
});

// ---- held-out sets (written before the 4.3.1 benchmark run; never used to tune any guard) ---------------------------------
const HELD_MIN = { negation: 8, approve: 8, reject: 8, revoke: 8, name: 3, number: 3, date: 3, software: 5, email: 2, code: 2, glossary: 6, long: 2, collision: 2, mixed: 2, unaccented: 3 };
const words = (s) => new Set(String(s).toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []);
const jaccard = (a, b) => {
  const A = words(a);
  const B = words(b);
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter || 1);
};

for (const [file, direction] of [['heldout-vi-en.json', 'vi-en'], ['heldout-en-vi.json', 'en-vi']]) {
  const fx = load(file);
  const items = fx.items;
  const main = load(`${direction}.json`).items;

  test(`${file}: AI-draft caveat, direction and at least 30 items`, () => {
    assert.equal(fx.referenceAuthor, REF_AUTHOR);
    assert.equal(fx.direction, direction);
    assert.ok(items.length >= 30, `only ${items.length} items`);
  });

  test(`${file}: well formed, unique ids (distinct from the main set), known categories`, () => {
    const ids = new Set(main.map((i) => i.id));
    for (const it of items) {
      assert.ok(!ids.has(it.id), `id ${it.id} duplicates a main-set id or a held-out id`);
      ids.add(it.id);
      assert.match(it.id, /^h-/, it.id);
      for (const k of ['source', 'reference']) assert.equal(typeof it[k], 'string', `${it.id}.${k}`);
      assert.ok(it.source.length > 0 && it.reference.length > 0, it.id);
      for (const c of it.categories) assert.ok(ALLOWED.includes(c), `${it.id}: unknown category ${c}`);
      assert.ok(Array.isArray(it.protected) && Array.isArray(it.mustContain) && Array.isArray(it.mustNotContain), it.id);
    }
  });

  test(`${file}: coverage per class (at least 8 items for each polarity class)`, () => {
    const count = (c) => items.filter((i) => i.categories.includes(c)).length;
    for (const [cat, min] of Object.entries(HELD_MIN)) if (cat !== 'unaccented' || direction === 'vi-en') assert.ok(count(cat) >= min, `${cat}: ${count(cat)} < ${min}`);
  });

  test(`${file}: new wordings, not copies or close paraphrases of the main set (word Jaccard < 0.6 against every main source)`, () => {
    for (const it of items) {
      for (const m of main) {
        const j = jaccard(it.source, m.source);
        assert.ok(j < 0.6, `${it.id} vs ${m.id}: Jaccard ${j.toFixed(2)}`);
      }
    }
  });

  test(`${file}: protected strings occur verbatim in source and reference; references pass their own checks; synthetic e-mail only`, () => {
    const emailRe = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
    for (const it of items) {
      for (const p of it.protected) {
        assert.ok(it.source.includes(p), `${it.id}: "${p}" not in source`);
        assert.ok(it.reference.includes(p), `${it.id}: "${p}" not in reference`);
      }
      const m = checkMeaning(it.reference, it);
      assert.ok(m.pass, `${it.id}: reference fails ${JSON.stringify(m)}`);
      assert.ok(checkPreservation(it.reference, it.protected).all, it.id);
      for (const text of [it.source, it.reference]) for (const e of text.match(emailRe) || []) assert.ok(/\.example$/.test(e), `${it.id}: ${e}`);
    }
    for (const it of items.filter((i) => i.categories.includes('collision'))) assert.match(it.source, /<x\d+>/, it.id);
  });

  test(`${file}: long items are single sentences over 400 characters`, () => {
    for (const it of items.filter((i) => i.categories.includes('long'))) {
      assert.ok(it.source.length > 400, `${it.id} too short (${it.source.length})`);
      assert.ok(!/[.!?]\s+\p{Lu}/u.test(it.source), `${it.id} must be one sentence`);
    }
  });
}

test('held-out files are in sync with fixtures/src (run `node fixtures/build.mjs`)', async () => {
  const { buildFixtures } = await import('./fixtures/build.mjs');
  const built = buildFixtures();
  assert.deepEqual(built['heldout-vi-en.json'], load('heldout-vi-en.json'));
  assert.deepEqual(built['heldout-en-vi.json'], load('heldout-en-vi.json'));
});
