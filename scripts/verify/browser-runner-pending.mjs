// pnpm test:browser
// The browser runner is not installed: the delivery plan (B1a) allows @playwright/test only after a
// dependency review. Until then this command fails loudly instead of pretending the gate passed.
// When the review approves it, replace the `test:browser` script with
// `playwright test -c test/browser/playwright.config.ts` and delete this file.
console.error(
  [
    'test:browser is not configured: no browser runner is installed.',
    'B1a allows @playwright/test only after a dependency review; B10b falls back to a documented manual checklist.',
    'The browser gate is therefore UNVERIFIED, not passed.',
  ].join('\n'),
);
process.exitCode = 1;
