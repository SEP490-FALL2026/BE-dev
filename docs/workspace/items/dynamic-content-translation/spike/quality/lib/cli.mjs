// Command-line parsing for run-benchmark.mjs (pure).
const DEFAULTS = {
  direction: 'both',
  mode: 'both',
  fixtures: 'main',
  tag: null,
  warmup: 2,
  repetitions: 3,
  out: null,
  maxSegmentTokens: 128,
  limit: null,
  knownTerms: 'fixture',
};

const FLAGS = {
  '--direction': ['direction', 'string'],
  '--mode': ['mode', 'string'],
  '--fixtures': ['fixtures', 'string'],
  '--tag': ['tag', 'string'],
  '--warmup': ['warmup', 'int'],
  '--repetitions': ['repetitions', 'int'],
  '--out': ['out', 'string'],
  '--max-segment-tokens': ['maxSegmentTokens', 'int'],
  '--limit': ['limit', 'int'],
  '--known-terms': ['knownTerms', 'string'],
};

export const FIXTURE_SETS = ['main', 'heldout'];

export function parseArgs(argv) {
  const o = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    let flag = argv[i];
    let value;
    const eq = flag.indexOf('=');
    if (eq !== -1) {
      value = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    }
    const spec = FLAGS[flag];
    if (!spec) throw new Error(`unknown option ${flag}`);
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) throw new Error(`${flag} requires a value`);
    }
    const [key, type] = spec;
    if (type === 'int') {
      if (!/^-?\d+$/.test(value)) throw new Error(`${flag} expects an integer, got "${value}"`);
      o[key] = Number(value);
    } else {
      o[key] = value;
    }
  }
  if (!['vi-en', 'en-vi', 'both'].includes(o.direction))
    throw new Error(`direction must be vi-en, en-vi or both (got "${o.direction}")`);
  if (!['raw', 'protected', 'both'].includes(o.mode))
    throw new Error(`mode must be raw, protected or both (got "${o.mode}")`);
  if (!o.fixtures.split(',').every((s) => FIXTURE_SETS.includes(s)))
    throw new Error(`fixtures must be main, heldout or main,heldout (got "${o.fixtures}")`);
  if (o.warmup < 0) throw new Error('warmup must be >= 0');
  if (o.repetitions < 1) throw new Error('repetitions must be >= 1');
  if (o.maxSegmentTokens < 1) throw new Error('max-segment-tokens must be >= 1');
  if (!['fixture', 'none'].includes(o.knownTerms))
    throw new Error(`known-terms must be fixture or none (got "${o.knownTerms}")`);
  if (o.limit !== null && o.limit < 1) throw new Error('limit must be >= 1');
  return o;
}
