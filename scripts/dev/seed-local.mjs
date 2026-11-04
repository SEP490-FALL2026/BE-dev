import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { classifyDatabaseUrl } from './local-database-host.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CONSENT_KEY = 'PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION';
const READY_PATH = '/api/v1/health/ready';

export function parseSettings(text) {
  const settings = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || Object.hasOwn(settings, match[1])) throw new Error('Invalid or duplicate configuration key.');
    const value = match[2];
    settings[match[1]] = /^(".*"|'.*')$/.test(value) ? value.slice(1, -1) : value;
  }
  return settings;
}

export function validateLocalSettings(settings) {
  if (settings.NODE_ENV !== 'development') throw new Error('NODE_ENV must be development.');
  if (!settings.DATABASE_URL || classifyDatabaseUrl(settings.DATABASE_URL) !== 'loopback')
    throw new Error('DATABASE_URL must name a parsed loopback host.');
  for (const key of ['SEED_SUPER_ADMIN_PASSWORD', 'SEED_DEMO_ACCOUNT_PASSWORD']) {
    if (!settings[key] || /[\r\n]/.test(settings[key])) throw new Error(`Missing or invalid ${key}.`);
  }
  const port = Number(settings.PORT || 3000);
  const timeout = Number(settings.SEED_READY_TIMEOUT_SECONDS || 120);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(timeout) || timeout <= 0)
    throw new Error('Invalid port or ready timeout.');
  const url = new URL(settings.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database.includes('/')) throw new Error('DATABASE_URL must name one database.');
  return { ...settings, PORT: String(port), timeout, database, host: url.hostname, databasePort: url.port || '5432' };
}

/** The guards above run before the first possible child process, including build. Tests inject commands, never databases. */
export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const root = dependencies.root || ROOT;
  const output = dependencies.output || ((text) => process.stdout.write(`${text}\n`));
  let runner;
  try {
    const settings = validateLocalSettings(parseSettings(fs.readFileSync(path.join(root, '.env.seed.local'), 'utf8')));
    const options = argumentsOf(argv);
    const origin = `http://127.0.0.1:${settings.PORT}`;
    const probe = dependencies.probe || responds;
    output('Stop pnpm start:worker before seeding.');
    if (await probe(origin, false))
      throw new Refusal('Stop pnpm start:dev before seeding; the API port is responding.');
    const env = {
      ...(dependencies.parentEnvironment || process.env),
      ...settings,
      DOTENV_CONFIG_PATH: path.join(root, '.env.seed.local'),
    };
    delete env[CONSENT_KEY];
    runner = dependencies.runner || (dependencies.runnerFactory || createChildRunner)(root, env);
    const run = (command, args, input = '') => runner.run(command, args, input);
    const node = (args, input) => run(process.execPath, args, input);
    const prisma = (args) => node(['node_modules/prisma/build/index.js', ...args]);
    if ((dependencies.needsBuild || needsBuild)(root)) requireSuccess(await run('pnpm', ['build']));
    const input = `SUPER_ADMIN_PASSWORD=${settings.SEED_SUPER_ADMIN_PASSWORD}\nDEMO_ACCOUNT_PASSWORD=${settings.SEED_DEMO_ACCOUNT_PASSWORD}\n`;
    const checked = await node(
      ['dist/cli.js', 'seed', 'check', '--environment', 'LOCAL_TEST', '--secrets-stdin'],
      input,
    );
    if (runner.aborted) throw new Error('Interrupted');
    const state = fieldsOf(checked.stdout);
    if (checked.code === 3 && state.STATE !== 'NOT_MIGRATED') return 3;
    if (![0, 1, 2, 3].includes(checked.code)) throw new Error('Seed check failed.');
    const action = await chooseAction(settings, options, checked, state, output, dependencies.ask || ask);
    if (action === 'exit') return 0;
    if (action === 'reset') requireSuccess(await prisma(['migrate', 'reset', '--force']));
    requireSuccess(await prisma(['migrate', 'deploy']));
    runner.start(process.execPath, ['dist/main']);
    runner.start(process.execPath, ['dist/worker']);
    const deadline = Date.now() + settings.timeout * 1000;
    while (!(await probe(origin + READY_PATH, true))) {
      if (runner.aborted) throw new Error('Interrupted');
      if (Date.now() >= deadline) throw new Error('API ready timeout.');
      await (dependencies.delay || delay)(250);
    }
    const applied = await node(
      [
        'dist/cli.js',
        'seed',
        'apply',
        '--allow-bootstrap',
        '--environment',
        'LOCAL_TEST',
        '--api-url',
        origin,
        '--operator-reference',
        'LOCAL-SEED',
        '--secrets-stdin',
      ],
      input,
    );
    output(applied.stdout);
    return applied.code;
  } catch (error) {
    output(error instanceof Refusal ? error.message : safeFailure(error));
    return error instanceof Refusal || !runner ? 3 : 1;
  } finally {
    await runner?.close();
  }
}

class Refusal extends Error {}
function safeFailure(error) {
  return error?.message === 'API ready timeout.'
    ? error.message
    : 'Seed failed; check the completed steps before retrying.';
}
function requireSuccess(result) {
  if (result.code !== 0) throw new Error('Child command failed.');
}
export function fieldsOf(text) {
  return Object.fromEntries(
    text
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [key, ...rest] = line.split('\t');
        return [key, rest.join('\t')];
      }),
  );
}
function argumentsOf(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--continue') options.continue = true;
    else if (argv[i] === '--confirm-reset' && argv[i + 1]) options.reset = argv[++i];
    else throw new Refusal('Unknown or incomplete option.');
  }
  if (options.continue && options.reset) throw new Refusal('Choose reset or continue.');
  return options;
}
async function chooseAction(settings, options, checked, state, output, prompt) {
  if (checked.code === 0 || (checked.code === 3 && state.STATE === 'NOT_MIGRATED')) return 'continue';
  output(
    `Database ${settings.database}; host ${settings.host}; port ${settings.databasePort}; organization ${state.ORGANIZATION || '-'}; environment ${state.ENVIRONMENT || 'UNKNOWN'}; ${state.COUNTS || 'counts unavailable'}`,
  );
  const choice =
    options.reset ??
    (options.continue ? 'c' : await prompt('Type the database name to reset, c to continue, or Enter to exit: '));
  if (choice === '') return 'exit';
  if (choice === 'c' && checked.code === 2 && state.STATE === 'INSTALLED' && state.FIXTURE_ORGANIZATION === 'yes')
    return 'continue';
  if (choice !== settings.database) throw new Refusal('Confirmation refused for this database state.');
  if (state.ENVIRONMENT === 'SHARED')
    throw new Refusal('This database was bootstrapped for a shared environment; local reset refused.');
  return 'reset';
}
async function ask(question) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function responds(url, ready) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(750) });
    return ready ? response.ok : true;
  } catch {
    return false;
  }
}
function newest(directory) {
  return fs.existsSync(directory)
    ? Math.max(
        0,
        ...fs
          .readdirSync(directory, { withFileTypes: true })
          .map((entry) =>
            entry.isDirectory()
              ? newest(path.join(directory, entry.name))
              : fs.statSync(path.join(directory, entry.name)).mtimeMs,
          ),
      )
    : 0;
}
export function needsBuild(root) {
  const cli = path.join(root, 'dist/cli.js');
  return (
    !fs.existsSync(cli) ||
    fs.statSync(cli).mtimeMs < Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'prisma')))
  );
}

function terminateChild(child) {
  if (!child.pid) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGTERM');
}

/** Register cleanup before spawning; each registry entry exists before its child does. */
export function createChildRunner(root, env, spawnChild = spawn, terminate = terminateChild) {
  const children = new Set();
  let aborted = false;
  const stop = () => {
    for (const entry of children) if (entry.child) terminate(entry.child);
  };
  const interrupted = () => {
    aborted = true;
    stop();
    process.exitCode = 130;
  };
  process.on('exit', stop);
  process.on('SIGINT', interrupted);
  process.on('SIGTERM', interrupted);
  const start = (command, args, input = '') => {
    if (aborted) throw new Error('Interrupted');
    const entry = {};
    children.add(entry);
    const child = spawnChild(command, args, {
      cwd: root,
      env,
      shell: command === 'pnpm' && process.platform === 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    entry.child = child;
    let stdout = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', () => undefined);
    const finished = new Promise((resolve) => {
      child.once('error', () => {
        children.delete(entry);
        resolve({ code: 1, stdout: '' });
      });
      child.once('close', (code) => {
        children.delete(entry);
        resolve({ code: code ?? 1, stdout });
      });
    });
    entry.finished = finished;
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(input);
    return finished;
  };
  return {
    get aborted() {
      return aborted;
    },
    run: start,
    start: (command, args) => {
      void start(command, args);
    },
    close: async () => {
      stop();
      await Promise.allSettled([...children].map((entry) => entry.finished));
      process.removeListener('exit', stop);
      process.removeListener('SIGINT', interrupted);
      process.removeListener('SIGTERM', interrupted);
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main();
