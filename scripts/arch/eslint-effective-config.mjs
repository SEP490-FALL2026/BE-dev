// `node scripts/arch/eslint-effective-config.mjs [--rules a,b] <file-or-folder>...`: prints, as JSON, what ESLint really applies to each
// file: the severity and options of the rules asked for (all of them without `--rules`) and `reportUnusedDisableDirectives`, after every
// override of `eslint.config.mjs` has been merged. A folder stands for the `.ts` files below it (`generated` and `node_modules` aside).
// The gate `lint-debt` reads it, so a rule relaxed by a later override (a `warn`, an `off`) is seen as the relaxed rule and not as the
// text of the config. It runs in its own process because ESLint loads the flat config with a dynamic `import()`, which Jest does not allow.
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { ESLint } = createRequire(import.meta.url)('eslint');

const args = process.argv.slice(2);
const rulesAt = args.indexOf('--rules');
const wanted = rulesAt === -1 ? null : args[rulesAt + 1].split(',');
const targets = args.filter((_, index) => rulesAt === -1 || (index !== rulesAt && index !== rulesAt + 1));

function filesOf(target) {
  if (!statSync(target).isDirectory()) return [target];

  return readdirSync(target).flatMap((entry) =>
    entry === 'generated' || entry === 'node_modules' ? [] : filesOf(join(target, entry)),
  );
}

const eslint = new ESLint({ cwd: process.cwd() });
const effective = {};
for (const file of targets.flatMap(filesOf).filter((path) => path.endsWith('.ts'))) {
  const config = await eslint.calculateConfigForFile(file);
  // an ignored file has no configuration
  effective[file.split('\\').join('/')] = config
    ? {
        rules: Object.fromEntries(
          Object.entries(config.rules ?? {}).filter(([name]) => wanted === null || wanted.includes(name)),
        ),
        unused: config.linterOptions?.reportUnusedDisableDirectives ?? null,
      }
    : null;
}

process.stdout.write(JSON.stringify(effective));
