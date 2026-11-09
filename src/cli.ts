import { COMMANDS } from './cli/commands';

/**
 * The command process: `node dist/cli.js <command> [options]`. The commands and their code are listed in
 * `cli/commands.ts`; the old entries `dist/<alias>.js` call `run('<command>')` (scripts/build/emit-cli-aliases.mjs).
 */

const width = Math.max(...COMMANDS.map((command) => command.name.length));

export const CLI_USAGE = [
  'Usage: node dist/cli.js <command> [options]',
  '',
  'Commands',
  ...COMMANDS.map((command) => `  ${command.name.padEnd(width)}  ${command.description}`),
  '',
  '`node dist/cli.js <command> --help` lists the options and exit codes of a command.',
].join('\n');

/** Runs one command on `argv` (the words after its name) and sets `process.exitCode`. Never rejects. */
export async function run(name: string, argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const entry = COMMANDS.find((command) => command.name === name);
  if (entry === undefined) {
    process.stderr.write(`Unknown command: ${name}\n\n${CLI_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const command = await entry.load();
    process.exitCode = await command.run(argv);
  } catch (error) {
    process.stderr.write(`The command failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = 1;
  }
}

/** `node dist/cli.js <command> [options]`, or `--help` for the list of commands. */
export async function main(argv: readonly string[]): Promise<void> {
  const [name, ...rest] = argv;
  if (name === '--help' || name === '-h' || name === 'help') {
    process.stdout.write(`${CLI_USAGE}\n`);
    return;
  }
  if (name === undefined) {
    process.stderr.write(`Name a command.\n\n${CLI_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  await run(name, rest);
}

if (require.main === module) void main(process.argv.slice(2));
