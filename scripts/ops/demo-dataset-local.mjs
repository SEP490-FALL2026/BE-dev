#!/usr/bin/env node
// Runs `pnpm ops:demo-dataset` from a local checkout (Windows included) against the shared VPS, without a new image:
// the command's HTTP calls go to the VPS API over HTTPS, and its in-process part (the demo sign-in accounts and the
// checks of the target) reaches the VPS PostgreSQL through an SSH tunnel bound to 127.0.0.1 on this machine. PostgreSQL
// is never published on the VPS and the API/worker images are not touched.
//
//   node scripts/ops/demo-dataset-local.mjs --config <private file> --mode plan|apply
//
// Before anything else it proves the local code fits what is deployed: the immutable image of
// `<DEMO_REMOTE_APP_DIR>/releases/current-image` names a commit this checkout has, and the checkout's `prisma/` and
// `openapi.json` (working tree included) are those of that commit. A fresh `pnpm build` must exist. Then it opens the
// tunnel, runs `node dist/demo-dataset-cli.js` with NODE_ENV=production (the command refuses any role but the runtime
// role) and the private settings, and closes the tunnel whatever happened.
//
// Secrets: the private file is read as data (NAME=VALUE, no expansion), must not be tracked or unignored by Git. The two
// application passwords go to the command on standard input; the database password only inside DATABASE_URL in the
// environment of that one child process — never an argument, never printed, never in the kept report. SSH must work
// without a prompt (a key or an agent: BatchMode).
//
// Exit codes: the command's (0 done/planned · 2 nothing to change · 4 conflict or blocked · 3 refused · 1 failed), and 3
// when this script refuses before the command runs, 1 when the tunnel fails.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REQUIRED = [
  'DEMO_FIXTURE',
  'DEMO_ORGANIZATION_NAME',
  'DEMO_OPERATOR_REFERENCE',
  'DEMO_API_URL',
  'DEMO_SSH_TARGET',
  'DEMO_REMOTE_APP_DIR',
  'DEMO_DATABASE_NAME',
  'DEMO_DATABASE_USER',
  'DEMO_DATABASE_PASSWORD',
  'DEMO_SUPER_ADMIN_PASSWORD',
  'DEMO_ACCOUNT_PASSWORD',
];
const OPTIONAL = {
  DEMO_SSH_PORT: '22',
  DEMO_SSH_IDENTITY_FILE: '',
  DEMO_POSTGRES_CONTAINER: 'slm-postgres',
  DEMO_LOCAL_PORT: '15432',
  DEMO_REPORT_DIR: '',
};
const SECRET_KEYS = ['DEMO_DATABASE_PASSWORD', 'DEMO_SUPER_ADMIN_PASSWORD', 'DEMO_ACCOUNT_PASSWORD'];
/** Sources whose change needs a new `pnpm build` before the command runs. */
const BUILD_INPUTS = ['src/cli', 'src/modules', 'src/infrastructure', 'src/core'];
const CONTRACT_PATHS = ['prisma', 'openapi.json'];

export class LocalRunRefusal extends Error {}

const refuse = (message) => {
  throw new LocalRunRefusal(message);
};

/** The private settings, read as data. Line endings LF or CRLF; one pair of outer quotes is removed. */
export function parseLocalConfig(text) {
  const settings = {};
  for (const [index, raw] of text.replace(/^﻿/, '').split('\n').entries()) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) refuse(`line ${index + 1} is not NAME=VALUE`);
    const [, name, rawValue] = match;
    if (!REQUIRED.includes(name) && !(name in OPTIONAL)) refuse(`line ${index + 1}: unknown setting ${name}`);
    if (name in settings) refuse(`${name} is set twice`);
    const quoted = /^(['"])(.*)\1$/.exec(rawValue);
    const value = quoted ? quoted[2] : rawValue;
    if (/[\u0000-\u001f\u007f]/.test(value)) refuse(`${name} has a control character`);
    settings[name] = value;
  }
  for (const name of REQUIRED) if (!settings[name]) refuse(`${name} is required`);
  for (const [name, fallback] of Object.entries(OPTIONAL)) settings[name] ||= fallback;

  return validated(settings);
}

function validated(s) {
  let api;
  try {
    api = new URL(s.DEMO_API_URL);
  } catch {
    refuse('DEMO_API_URL is not a URL');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname);
  if (api.protocol !== 'https:' && !(api.protocol === 'http:' && loopback))
    refuse('DEMO_API_URL must be https (http only for a loopback rehearsal)');
  if (api.username || api.password || api.search || api.hash || (api.pathname !== '/' && api.pathname !== ''))
    refuse('DEMO_API_URL is an origin only: no credentials, path, query or fragment');
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(s.DEMO_SSH_TARGET)) refuse('DEMO_SSH_TARGET must be user@host');
  if (!/^\/[A-Za-z0-9/_.-]*$/.test(s.DEMO_REMOTE_APP_DIR)) refuse('DEMO_REMOTE_APP_DIR must be an absolute plain path');
  if (!/^[A-Za-z0-9_.-]+$/.test(s.DEMO_POSTGRES_CONTAINER)) refuse('DEMO_POSTGRES_CONTAINER is not a container name');
  for (const name of ['DEMO_DATABASE_NAME', 'DEMO_DATABASE_USER'])
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s[name])) refuse(`${name} is not a plain PostgreSQL name`);
  for (const [name, low] of [
    ['DEMO_SSH_PORT', 1],
    ['DEMO_LOCAL_PORT', 1024],
  ]) {
    const port = Number(s[name]);
    if (!Number.isInteger(port) || port < low || port > 65535) refuse(`${name} must be a port from ${low} to 65535`);
  }

  return { ...s, DEMO_API_URL: api.origin };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config' || argv[i] === '--mode') args[argv[i].slice(2)] = argv[++i];
    else refuse('usage: node scripts/ops/demo-dataset-local.mjs --config <private file> --mode plan|apply');
  }
  if (!args.config) refuse('--config is required');
  if (args.mode !== 'plan' && args.mode !== 'apply') refuse('--mode must be plan or apply');

  return { config: path.resolve(args.config), mode: args.mode };
}

/** The real outside world; the tests replace it. */
export const realWorld = {
  exec: (command, args, options = {}) => {
    const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
    return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  },
  spawnTunnel: (command, args) => spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }),
  spawnCli: (args, options) =>
    spawn(process.execPath, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
  portOpen: (port) =>
    new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => socket.end(() => resolve(true)));
      socket.once('error', () => resolve(false));
    }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  newestMtime: (relativeDirs, repository) => {
    let newest = 0;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'))
          newest = Math.max(newest, fs.statSync(full).mtimeMs);
      }
    };
    for (const dir of relativeDirs) if (fs.existsSync(path.join(repository, dir))) walk(path.join(repository, dir));
    return newest;
  },
};

function sshArgs(s, extra) {
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=15',
    '-p',
    s.DEMO_SSH_PORT,
    ...(s.DEMO_SSH_IDENTITY_FILE ? ['-i', s.DEMO_SSH_IDENTITY_FILE] : []),
    ...extra,
  ];
}

/** The private file must not be one Git would commit: outside any repository, or ignored and untracked there. */
function checkConfigNotCommittable(world, configPath) {
  const dir = path.dirname(configPath);
  const inside = world.exec('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') return;
  if (world.exec('git', ['-C', dir, 'ls-files', '--error-unmatch', '--', configPath]).status === 0)
    refuse('the private file is tracked by Git: move it out of the repository');
  if (world.exec('git', ['-C', dir, 'check-ignore', '-q', '--', configPath]).status !== 0)
    refuse('the private file sits in a Git repository and is not ignored: move it out or ignore it');
}

function checkBuild(world, repository) {
  const cli = path.join(repository, 'dist', 'demo-dataset-cli.js');
  const built = path.join(repository, 'dist', 'cli.js');
  if (!fs.existsSync(cli) || !fs.existsSync(built)) refuse('dist/demo-dataset-cli.js is missing: run pnpm build first');
  if (world.newestMtime(BUILD_INPUTS, repository) > fs.statSync(built).mtimeMs)
    refuse('the build is older than the sources: run pnpm build again');
  const help = world.exec(process.execPath, [cli, '--help'], { cwd: repository });
  if (!help.stdout.includes('--secrets-stdin')) refuse('the local build has no demo dataset command: run pnpm build');

  return cli;
}

/** The commit of the immutable image the VPS runs. */
function deployedCommit(world, s) {
  const result = world.exec(
    'ssh',
    sshArgs(s, [s.DEMO_SSH_TARGET, `cat ${s.DEMO_REMOTE_APP_DIR}/releases/current-image`]),
  );
  if (result.status !== 0) refuse(`cannot read releases/current-image over SSH (exit ${result.status})`);
  const match = /:([0-9a-f]{40})\s*$/.exec(result.stdout);
  if (!match) refuse('releases/current-image does not name an immutable image (…:<40-hex commit>)');

  return match[1];
}

/** The checkout's database schema and HTTP contract are those of the deployed commit (working tree included). */
function checkCompatible(world, repository, commit) {
  const git = (...args) => world.exec('git', ['-C', repository, ...args]);
  if (git('cat-file', '-e', `${commit}^{commit}`).status !== 0)
    refuse(`this checkout does not have the deployed commit ${commit.slice(0, 12)}: git fetch first`);
  const diff = git('diff', '--name-only', commit, '--', ...CONTRACT_PATHS);
  if (diff.status !== 0) refuse('git diff against the deployed commit failed');
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...CONTRACT_PATHS);
  const changed = [...diff.stdout.split('\n'), ...untracked.stdout.split('\n')].map((l) => l.trim()).filter(Boolean);
  if (changed.length)
    refuse(
      `the local schema/contract differs from the deployed commit ${commit.slice(0, 12)} (${changed.slice(0, 5).join(', ')}): ` +
        'deploy first or check out that commit',
    );
}

function postgresAddress(world, s) {
  const format = "'{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'";
  const result = world.exec(
    'ssh',
    sshArgs(s, [s.DEMO_SSH_TARGET, `docker inspect -f ${format} ${s.DEMO_POSTGRES_CONTAINER}`]),
  );
  const address = result.stdout.split(/\s+/).find((part) => /^\d{1,3}(\.\d{1,3}){3}$/.test(part));
  if (result.status !== 0 || !address) refuse(`cannot find the address of ${s.DEMO_POSTGRES_CONTAINER} on the VPS`);

  return address;
}

async function openTunnel(world, s, address) {
  const port = Number(s.DEMO_LOCAL_PORT);
  if (await world.portOpen(port)) refuse(`127.0.0.1:${port} is already in use: choose another DEMO_LOCAL_PORT`);
  const child = world.spawnTunnel(
    'ssh',
    sshArgs(s, [
      '-N',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ServerAliveInterval=30',
      '-L',
      `127.0.0.1:${port}:${address}:5432`,
      s.DEMO_SSH_TARGET,
    ]),
  );
  let exited = null;
  child.once('exit', (code) => (exited = code ?? 1));
  for (let waited = 0; waited < 20_000; waited += 250) {
    if (exited !== null) throw new Error(`the SSH tunnel stopped (exit ${exited})`);
    if (await world.portOpen(port)) return { child, port, exited: () => exited };
    await world.sleep(250);
  }
  child.kill();
  throw new Error('the SSH tunnel did not open within 20 seconds');
}

async function closeTunnel(world, tunnel) {
  if (!tunnel) return;
  if (tunnel.exited() === null) {
    const gone = new Promise((resolve) => tunnel.child.once('exit', resolve));
    tunnel.child.kill();
    await Promise.race([gone, world.sleep(5_000)]);
  }
  if (await world.portOpen(tunnel.port)) throw new Error(`the tunnel port 127.0.0.1:${tunnel.port} is still open`);
}

function redact(text, s) {
  let out = text;
  for (const key of SECRET_KEYS) if (s[key]) out = out.split(s[key]).join('***');
  return out;
}

async function runCommand(world, s, mode, cli, tunnel, report, io) {
  const runDir = path.join(s.DEMO_REPORT_DIR, '.run');
  fs.mkdirSync(runDir, { recursive: true }); // empty: no `.env` for the command to read
  const databaseUrl =
    `postgresql://${encodeURIComponent(s.DEMO_DATABASE_USER)}:${encodeURIComponent(s.DEMO_DATABASE_PASSWORD)}` +
    `@127.0.0.1:${tunnel.port}/${encodeURIComponent(s.DEMO_DATABASE_NAME)}`;
  const env = { NODE_ENV: 'production', DATABASE_URL: databaseUrl };
  for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'])
    if (process.env[name] !== undefined) env[name] = process.env[name];
  const child = world.spawnCli(
    [
      cli,
      mode,
      `--fixture=${s.DEMO_FIXTURE}`,
      `--organization=${s.DEMO_ORGANIZATION_NAME}`,
      `--api-url=${s.DEMO_API_URL}`,
      `--operator=${s.DEMO_OPERATOR_REFERENCE}`,
      '--environment=SHARED',
      '--secrets-stdin',
    ],
    { cwd: runDir, env },
  );
  const forward = (stream, sink) =>
    stream.on('data', (chunk) => {
      const text = redact(String(chunk), s);
      sink.write(text);
      report.push(text);
    });
  forward(child.stdout, io.stdout);
  forward(child.stderr, io.stderr);
  const exit = new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
  child.stdin.end(
    `SUPER_ADMIN_PASSWORD=${s.DEMO_SUPER_ADMIN_PASSWORD}\nDEMO_ACCOUNT_PASSWORD=${s.DEMO_ACCOUNT_PASSWORD}\n`,
  );

  return exit;
}

/** One local run. Answers the exit code; never throws past the tunnel. `io` receives what is printed. */
export async function runLocal(
  { config, mode },
  world = realWorld,
  repository = REPOSITORY,
  io = { stdout: process.stdout, stderr: process.stderr },
) {
  let settings;
  let tunnel = null;
  const report = [];
  const log = (line) => {
    io.stdout.write(`${line}\n`);
    report.push(`${line}\n`);
  };
  try {
    if (!fs.existsSync(config)) refuse('the private file does not exist');
    checkConfigNotCommittable(world, config);
    settings = parseLocalConfig(fs.readFileSync(config, 'utf8'));
    settings.DEMO_REPORT_DIR ||= path.join(path.dirname(config), 'demo-dataset-reports');
    const cli = checkBuild(world, repository);
    const commit = deployedCommit(world, settings);
    checkCompatible(world, repository, commit);
    log(`Deployed commit ${commit.slice(0, 12)} matches the local schema and contract; local build is current.`);
    const address = postgresAddress(world, settings);
    tunnel = await openTunnel(world, settings, address);
    log(`SSH tunnel open: 127.0.0.1:${tunnel.port} → ${settings.DEMO_POSTGRES_CONTAINER}:5432 on the VPS.`);
    return await runCommand(world, settings, mode, cli, tunnel, report, io);
  } catch (error) {
    const refused = error instanceof LocalRunRefusal;
    io.stderr.write(
      `${refused ? 'refused' : 'failed'}: ${settings ? redact(error.message, settings) : error.message}\n`,
    );
    report.push(`${refused ? 'refused' : 'failed'}: ${error.message}\n`);
    return refused ? 3 : 1;
  } finally {
    try {
      await closeTunnel(world, tunnel);
      if (tunnel) log('SSH tunnel closed.');
    } catch (error) {
      io.stderr.write(`warning: ${error.message}\n`);
    }
    if (settings) keepReport(settings, mode, report);
  }
}

function keepReport(s, mode, report) {
  fs.mkdirSync(s.DEMO_REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    path.join(s.DEMO_REPORT_DIR, `${stamp}-${s.DEMO_FIXTURE}-${mode}-local.txt`),
    redact(report.join(''), s),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`refused: ${error.message}\n`);
    process.exit(3);
  }
  process.exitCode = await runLocal(args);
}
