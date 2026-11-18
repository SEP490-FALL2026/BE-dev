// Jest environment of the integration and E2E runners: the Node environment plus how long each `beforeAll` of the file took,
// measured from the hook events of jest-circus (`hook_start`, then `hook_success` or `hook_failure` — a hook that times out
// ends in `hook_failure`). The reporter (timing-reporter.cjs) adds them to reports/test-timings/<runner>.json, so the time a
// file spends in `beforeAll` is measured, not estimated from the file time minus the test time.
// Extending the Node environment: https://jestjs.io/docs/test-environment; event types: @jest/types `Circus.AsyncEvent`.
const fs = require('node:fs');
const path = require('node:path');
const { TestEnvironment } = require('jest-environment-node');
const { hookTimingsFile } = require('./timing-reporter.cjs');

class TimingEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.timingsFile = hookTimingsFile(config.projectConfig.rootDir, context.testPath);
    this.started = new Map();
    this.beforeAllSeconds = [];
  }

  handleTestEvent(event) {
    if (event.name === 'hook_start' && event.hook.type === 'beforeAll') {
      this.started.set(event.hook, performance.now());
    } else if ((event.name === 'hook_success' || event.name === 'hook_failure') && this.started.has(event.hook)) {
      this.beforeAllSeconds.push(Number(((performance.now() - this.started.get(event.hook)) / 1000).toFixed(2)));
      this.started.delete(event.hook);
    }
  }

  async teardown() {
    // writtenAt lets the reporter ignore a file left by an earlier run of the same spec.
    fs.mkdirSync(path.dirname(this.timingsFile), { recursive: true });
    fs.writeFileSync(this.timingsFile, JSON.stringify({ writtenAt: Date.now(), beforeAll: this.beforeAllSeconds }));
    await super.teardown();
  }
}

module.exports = TimingEnvironment;
