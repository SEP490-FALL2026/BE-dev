// Jest reporter: writes reports/test-timings/<runner>.json (one row per spec file: seconds, tests, failures)
// and prints the slowest files. Used by every runner so a slow file is found by data, not by guess.
// Usage in a config: reporters: ['default', ['<rootDir>/test/config/timing-reporter.cjs', { runner: 'http' }]]
// Runners whose environment is timing-environment.cjs (integration, E2E) also get, per file, the longest `beforeAll`
// (`beforeAllSeconds`, `beforeAllHooks`) and a `beforeAll` summary over the files.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Where the environment of one spec file leaves its hook timings for the reporter. */
function hookTimingsFile(rootDir, testPath) {
  const name = crypto.createHash('sha1').update(testPath).digest('hex');
  return path.join(rootDir, 'reports', 'test-timings', 'hooks', `${name}.json`);
}

/**
 * The hook timings the environment wrote for this run of the file, or undefined (none, left by an earlier run, or cut short
 * by a crash); the file is consumed either way.
 */
function takeHookTimings(rootDir, suite) {
  const file = hookTimingsFile(rootDir, suite.testFilePath);
  if (!fs.existsSync(file)) return undefined;
  try {
    const timings = JSON.parse(fs.readFileSync(file, 'utf8'));
    return timings.writtenAt >= suite.perfStats.start ? timings : undefined;
  } catch {
    return undefined;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const at = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];

class TimingReporter {
  constructor(globalConfig, options = {}) {
    this.rootDir = globalConfig.rootDir;
    this.runner = options.runner ?? 'unknown';
    this.top = options.top ?? 10;
  }

  onRunComplete(_contexts, results) {
    const rows = results.testResults
      .map((suite) => {
        const row = {
          file: path.relative(this.rootDir, suite.testFilePath).split(path.sep).join('/'),
          seconds: Number(((suite.perfStats.end - suite.perfStats.start) / 1000).toFixed(2)),
          tests: suite.numPassingTests + suite.numFailingTests + suite.numPendingTests,
          failed: suite.numFailingTests + (suite.testExecError ? 1 : 0),
        };
        const hooks = takeHookTimings(this.rootDir, suite);
        if (hooks && hooks.beforeAll.length > 0) {
          row.beforeAllSeconds = Math.max(...hooks.beforeAll);
          row.beforeAllHooks = hooks.beforeAll.length;
        }
        return row;
      })
      .sort((a, b) => b.seconds - a.seconds);
    const sorted = rows.map((row) => row.seconds).sort((a, b) => a - b);
    const summary = {
      runner: this.runner,
      startedAt: new Date(results.startTime).toISOString(),
      wallSeconds: Number(((Date.now() - results.startTime) / 1000).toFixed(1)),
      files: rows.length,
      tests: results.numTotalTests,
      failedTests: results.numFailedTests,
      medianFileSeconds: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    };
    const withHooks = rows.filter((row) => row.beforeAllSeconds !== undefined);
    if (withHooks.length > 0) {
      const longest = withHooks.map((row) => row.beforeAllSeconds).sort((a, b) => a - b);
      summary.beforeAll = {
        files: withHooks.length,
        p50Seconds: at(longest, 0.5),
        p90Seconds: at(longest, 0.9),
        p99Seconds: at(longest, 0.99),
        maxSeconds: longest[longest.length - 1],
        slowest: [...withHooks]
          .sort((a, b) => b.beforeAllSeconds - a.beforeAllSeconds)
          .slice(0, this.top)
          .map((row) => ({ file: row.file, seconds: row.beforeAllSeconds })),
      };
    }
    summary.rows = rows;
    const dir = path.join(this.rootDir, 'reports', 'test-timings');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${this.runner}.json`), `${JSON.stringify(summary, null, 2)}\n`);

    const lines = rows.slice(0, this.top).map((row) => `  ${row.seconds.toFixed(1).padStart(7)} s  ${row.file}`);
    const hookLine = summary.beforeAll
      ? `\n  longest beforeAll per file: p50 ${summary.beforeAll.p50Seconds} s, p90 ${summary.beforeAll.p90Seconds} s, ` +
        `p99 ${summary.beforeAll.p99Seconds} s, max ${summary.beforeAll.maxSeconds} s (${summary.beforeAll.slowest[0].file})`
      : '';
    process.stderr.write(
      `\n[timings:${this.runner}] wall ${summary.wallSeconds} s, ${summary.files} files, median ` +
        `${summary.medianFileSeconds} s/file${hookLine}; slowest:\n${lines.join('\n')}\n`,
    );
  }
}

module.exports = TimingReporter;
module.exports.hookTimingsFile = hookTimingsFile;
