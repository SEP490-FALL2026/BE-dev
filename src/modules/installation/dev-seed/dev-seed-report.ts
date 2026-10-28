import { DevSeedResult, SeedItemKind, SeedRefusal, SeedReportItem } from './dev-seed.types';

const LABEL: Record<SeedItemKind, string> = {
  DEPARTMENT: 'department',
  COST_CENTER: 'cost center',
  EMPLOYEE: 'employee',
  ACCOUNT: 'account',
};

const WHY: Record<SeedRefusal, string> = {
  ENVIRONMENT_NOT_LOCAL: 'dev:seed runs only with NODE_ENV=development or NODE_ENV=test.',
  DATABASE_NOT_LOOPBACK: 'the database host is not localhost, 127.x.x.x or ::1.',
  DATABASE_URL_INVALID: 'DATABASE_URL is not a postgresql:// URL.',
  CONFIRMATION_MISSING: '--confirm-local is required.',
  NOT_INSTALLED: 'there is no installation yet; run pnpm ops:bootstrap first.',
  CONFLICT: 'existing data differs from the demo fixture (see the conflicts above); it is not changed.',
  STATE_CHANGED: 'the data changed while the seed was being prepared; run it again.',
  UNIQUE_KEY_TAKEN: 'a demo code or name is already used by other data.',
};

function line(item: SeedReportItem): string {
  const parts = [`  ${LABEL[item.kind].padEnd(12)}${item.key.padEnd(12)}${item.state}`];
  if (item.reason) parts.push(`(${item.reason})`);
  if (item.role) parts.push(item.role, item.loginEmail ?? '');
  if (item.password) parts.push(`password: ${item.password}`);
  return parts.join('  ').trimEnd();
}

/**
 * The report of a run: what goes to stdout and what goes to stderr. A new account's password appears here once, next
 * to its demo email; a rerun has no password to show.
 */
export function formatSeedResult(result: DevSeedResult): { stdout: string; stderr: string } {
  const lines = result.items.map(line);
  if (result.outcome === 'REFUSED') {
    const refusal = result.refusal ?? 'CONFLICT';
    return {
      stdout: '',
      stderr: [...lines, `Refused (${refusal}): ${WHY[refusal]} Nothing was written.`, ''].join('\n'),
    };
  }

  const footer =
    result.outcome === 'CREATED'
      ? ['Created. The passwords above are shown this once: they are not stored, logged or shown again.']
      : ['Everything is already present. Nothing was written; no password was reset.'];
  return { stdout: [`dev:seed: ${result.outcome}`, ...lines, ...footer, ''].join('\n'), stderr: '' };
}
