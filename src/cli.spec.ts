import { CLI_USAGE, main, run } from './cli';
import { DATABASE_ROLES_USAGE } from './cli/db-roles/db-roles.arguments';
import { COMMANDS } from './cli/commands';

describe('node dist/cli.js (Task 1b.2: one entry for every command)', () => {
  let stdout: string[];
  let stderr: string[];
  const spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    spies.push(
      jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      }),
      jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stderr.push(String(chunk));
        return true;
      }),
    );
  });

  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore());
    // The runner itself must not exit with the code a case set.
    process.exitCode = undefined;
  });

  it('lists every command of the table, with its description, for --help', async () => {
    await main(['--help']);

    expect(stdout).toEqual([`${CLI_USAGE}\n`]);
    for (const command of COMMANDS) expect(CLI_USAGE).toContain(`  ${command.name} `);
    for (const command of COMMANDS) expect(CLI_USAGE).toContain(command.description);
    expect(process.exitCode).toBeUndefined();
  });

  it('asks for a command when none is named, and refuses an unknown one, exit 1', async () => {
    await main([]);
    expect(stderr).toEqual([`Name a command.\n\n${CLI_USAGE}\n`]);
    expect(process.exitCode).toBe(1);

    stderr.length = 0;
    process.exitCode = undefined;
    await run('install-everything', []);
    expect(stderr).toEqual([`Unknown command: install-everything\n\n${CLI_USAGE}\n`]);
    expect(process.exitCode).toBe(1);
  });

  it('hands the words after the name to the command and sets its exit code', async () => {
    await main(['db-roles', '--help']);
    expect(stdout).toEqual([`${DATABASE_ROLES_USAGE}\n`]);
    expect(process.exitCode).toBe(0);

    stdout.length = 0;
    await run('db-roles', ['bogus']);
    expect(stderr).toEqual([`Name exactly one command: provision, reconcile or verify.\n\n${DATABASE_ROLES_USAGE}\n`]);
    expect(process.exitCode).toBe(1);
  });
});
