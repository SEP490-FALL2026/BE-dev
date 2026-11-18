// OD-A7: after `nest build`, writes the old command entries `dist/<alias>.js` from the command table, one line each:
// `require('./cli.js').run('<command>')`. Images, scripts/ops/*.sh and the operations guides call these paths inside
// running images (older ones included), so every alias is kept forever; the table (src/cli/commands.ts) is the only list.
// usage: node scripts/build/emit-cli-aliases.mjs [dist-dir]   (default: dist/ of this repository)
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist'));
// Reading the compiled table loads no command: each row imports its command only when it runs.
const { COMMANDS } = createRequire(import.meta.url)(join(dist, 'cli', 'commands.js'));

const NAME = /^[a-z][a-z0-9-]*$/;
for (const { name, alias } of COMMANDS) {
  if (!NAME.test(name) || !NAME.test(alias)) throw new Error(`Invalid command row: ${JSON.stringify({ name, alias })}`);
  writeFileSync(join(dist, `${alias}.js`), `require('./cli.js').run('${name}');\n`);
}
console.log(`emit-cli-aliases: ${COMMANDS.length} aliases in ${dist}`);
