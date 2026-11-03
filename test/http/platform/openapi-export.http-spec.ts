import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findOpenApi30Violations } from '../../../src/infrastructure/http/openapi-dialect';
import {
  CLI_COLD_START_MS,
  PROJECT_ROOT,
  cliWorkingDirectory,
  runScript,
  stopCliProcesses,
} from '../../support/cli-process';

/**
 * OPENAPI-EXPORT.1: `pnpm openapi:export` as a process, with the caller's default (development) environment, none of
 * the four E3 settings, and a `.env` in its working directory that must not be read. The export-only bootstrap supplies
 * ephemeral values in memory; the document comes out byte-identical to the committed one and no value leaks.
 */
describe('OpenAPI export (spawned process)', () => {
  let cwd: string;

  beforeAll(() => {
    cwd = cliWorkingDirectory('slm-openapi-export');
    // A decoy .env: were it read, the routes would move under another prefix and the document would differ.
    writeFileSync(join(cwd, '.env'), 'API_PREFIX=leaked\nAUTH_ACCESS_TOKEN_SECRET=decoy-value-that-must-not-be-read\n');
  });

  afterAll(() => {
    stopCliProcesses();
  });

  it(
    'writes the committed document with no E3 setting, no NODE_ENV and an unread .env, printing nothing',
    async () => {
      const output = join(cwd, 'openapi.json');

      const result = await runScript('scripts/dev/export-openapi.ts', [output], { cwd, environment: {} });

      expect(result).toEqual({ code: 0, stdout: '', stderr: '' });
      // GATE-01: exact bytes, no line-ending normalization. A CRLF checkout of openapi.json is a wrong artifact, not
      // an equivalent one; `.gitattributes` pins the file to LF so every checkout holds the exporter's bytes.
      const exportedBytes = readFileSync(output);
      const committedBytes = readFileSync(join(PROJECT_ROOT, 'openapi.json'));
      expect(exportedBytes.includes(0x0d)).toBe(false);
      expect(committedBytes.includes(0x0d)).toBe(false);
      expect(exportedBytes.equals(committedBytes)).toBe(true);
      const exported = exportedBytes.toString('utf8');
      expect(exported).not.toContain('leaked');
      expect(exported).not.toContain('decoy-value');
      expect(exported).not.toMatch(/export-[0-9a-f]{8}/);
    },
    CLI_COLD_START_MS,
  );

  it('commits one coherent OpenAPI 3.0 document that client generators accept (OPENAPI-EXAMPLE.1-F3)', () => {
    // The artifact itself, as FE/Mobile read it: a dependency upgrade that slips JSON Schema 2020-12 shapes past the
    // presentation step fails here, with the pointer and reason of each one.
    const committed = JSON.parse(readFileSync(join(PROJECT_ROOT, 'openapi.json'), 'utf8')) as { openapi: string };

    expect(committed.openapi).toBe('3.0.0');
    expect(findOpenApi30Violations(committed)).toEqual([]);
  });

  it('pins only openapi.json to LF in the repository attributes (GATE-EOL=A)', () => {
    const rules = readFileSync(join(PROJECT_ROOT, '.gitattributes'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    // Exactly one narrow rule: no repository-wide `* text=auto eol=lf`, no renormalization of unrelated files.
    expect(rules).toEqual(['openapi.json text eol=lf']);
  });

  it(
    'fails with its own one-line message and leaves no temporary folder when the API graph cannot start',
    async () => {
      // The child's temporary folder (os.tmpdir() reads TMPDIR on Linux, TEMP/TMP on Windows) is one this test owns.
      const temporary = cliWorkingDirectory('slm-openapi-export-tmp');
      const output = join(cwd, 'never-written.json');

      const result = await runScript('scripts/dev/export-openapi.ts', [output], {
        cwd,
        environment: { PORT: 'not-a-port', TMPDIR: temporary, TEMP: temporary, TMP: temporary },
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/^OpenAPI export failed \w+\n$/);
      // The toolchain may leave its own compile cache there; the export's isolated folder must be gone.
      expect(readdirSync(temporary).filter((name) => name.startsWith('slm-openapi-export-'))).toEqual([]);
      expect(existsSync(output)).toBe(false);
    },
    CLI_COLD_START_MS,
  );
});
