// Production-shaped spawn for the real worker: explicit minimal env (no secrets, parent env NOT inherited),
// bounded V8 heap, piped stdio, IPC channel. Pass to `new Supervisor({ spawn })`.
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.mjs');

// execPath / workerPath / cwd exist so spawn FAILURES can be provoked (bench `spawnfail`): a missing execPath or cwd makes
// fork() emit an async 'error' with pid undefined; a missing workerPath starts node, which exits 1 (an ordinary crash).
export function makeSpawn({ depsDir, modelsDir, intraThreads = 1, maxOldSpaceMb = 256, lockPath = null, maxNewTokensOverride = null, workerPath = WORKER, execPath = undefined, cwd = undefined }) {
  return function spawnWorker() {
    const env = {
      SPIKE_MODELS_DIR: modelsDir,
      SPIKE_INTRA_THREADS: String(intraThreads),
      NODE_ENV: 'production',
    };
    if (depsDir) env.SPIKE_DEPS_DIR = depsDir;
    if (lockPath) env.SPIKE_MODEL_LOCK = lockPath; // default: ../model-lock.json
    if (maxNewTokensOverride !== null) env.SPIKE_MAX_NEW_TOKENS = String(maxNewTokensOverride); // TEST/BENCH ONLY (provokes truncation)
    // Only what the process needs to start and load native libraries; nothing else (no tokens, no DB URLs).
    if (process.env.PATH) env.PATH = process.env.PATH;
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot; // Windows native loader
    return fork(workerPath, [], {
      ...(execPath ? { execPath } : {}),
      ...(cwd ? { cwd } : {}),
      env,
      execArgv: [`--max-old-space-size=${maxOldSpaceMb}`],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
  };
}
