// The bash that runs the repository's host scripts in their regression tests (GATE-RV-01), shared by
// backup-retention.test.mjs and deploy-release.test.mjs. Nothing here runs a script or asserts.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { win32 } from 'node:path';

/** Git Bash reads `/c/...`, not `C:\...`. */
export const toGitBashPath = (path) =>
  path.replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`).replace(/\\/g, '/');

function activeGitExecPath() {
  const result = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

const isExistingFile = (path) => statSync(path, { throwIfNoEntry: false })?.isFile() === true;

/**
 * The bash that runs the script, and the path form it reads. A bare `bash` on Windows follows the parent shell's PATH:
 * from PowerShell that is the WSL launcher (`System32` or `WindowsApps`), which cannot read Git-Bash paths (exit 127).
 * Windows therefore takes `bin\bash.exe` of the Git for Windows that `git --exec-path` reports
 * (`<root>\mingw64\libexec\git-core`). Not `usr\bin\bash.exe`: started outside Git Bash it finds Windows `sort`.
 */
export function bashFor({
  platform = process.platform,
  gitExecPath = activeGitExecPath,
  isFile = isExistingFile,
} = {}) {
  if (platform !== 'win32') return { executable: 'bash', path: (path) => path };
  const execPath = gitExecPath();
  const executable = /^[A-Za-z]:[\\/]/.test(execPath ?? '')
    ? win32.resolve(execPath, '..', '..', '..', 'bin', 'bash.exe')
    : undefined;
  if (!executable || !isFile(executable)) {
    throw new Error(
      `Git for Windows Bash not found (looked for ${executable ?? 'bin\\bash.exe beside git --exec-path'}). ` +
        'The host-script tests need Git for Windows with `git` on PATH; the WSL bash in System32/WindowsApps cannot run them.',
    );
  }
  return { executable, path: toGitBashPath };
}
