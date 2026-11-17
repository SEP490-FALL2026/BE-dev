import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { notificationTarget } from './notification-target.policy';

const ID = '11111111-1111-4111-8111-111111111111';
const HTTP_METHOD = /@(?:Get|Post|Put|Patch|Delete)\(/g;

/**
 * The roles that read the route of an operation, taken from the `@RequireRoles` or `@AuthenticatedOnly` of its method in the controllers:
 * `openapi.json` does not carry the roles of a route, so the source of the controllers is the only place that says them.
 */
function rolesThatRead(operationId: string): readonly string[] | 'ANY' {
  const root = join(__dirname, '../..');
  for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.controller.ts')) continue;
    const text = readFileSync(join(root, file), 'utf8');
    const at = text.indexOf(`operationId: '${operationId}'`);
    if (at < 0) continue;
    const method = [...text.slice(0, at).matchAll(HTTP_METHOD)].at(-1);
    const head = text.slice(method?.index ?? at, at);
    const required = /@RequireRoles\(([^)]*)\)/.exec(head);
    if (required) return [...required[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    if (head.includes('@AuthenticatedOnly')) return 'ANY';
    throw new Error(`${operationId} has neither @RequireRoles nor @AuthenticatedOnly on its method`);
  }
  throw new Error(`no controller declares ${operationId}`);
}

/** Who is told of each notice of SBF-20 (SPEC-5A-SBF20 §4.6, `noticeRecipients` and `RenewalRecordTrailService.told`), by role. */
const RECIPIENT_ROLES_OF_SBF20: Readonly<Record<string, readonly string[]>> = {
  SUBSCRIPTION_RENEWAL_RED_ALERT: ['IT_ADMIN', 'FINANCE'],
  SUBSCRIPTION_RENEWAL_KEPT: ['IT_ADMIN'],
  SUBSCRIPTION_RENEWAL_DATA_QUALITY: ['IT_ADMIN'],
  SUBSCRIPTION_EXPIRY_MARKED: ['IT_ADMIN', 'FINANCE'],
  SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED: ['FINANCE', 'IT_ADMIN'],
  SUBSCRIPTION_AUTO_RENEWAL_INCIDENT: ['IT_ADMIN', 'FINANCE', 'SPENDING_APPROVER'],
};

describe('the route a notice of SBF-20 opens', () => {
  it('reads the roles of a route from its controller', () => {
    expect(rolesThatRead('subscriptionGet')).toEqual(['IT_ADMIN', 'FINANCE']);
    expect(rolesThatRead('subscriptionDeadlineEventList')).toEqual([
      'IT_ADMIN',
      'FINANCE',
      'SPENDING_APPROVER',
      'SUPER_ADMIN',
    ]);
    expect(rolesThatRead('subscriptionRenewalGet')).toBe('ANY');
  });

  it('is open to every role that is told of the notice, also when the notice carries no case of renewal', () => {
    const closedRoutes: string[] = [];
    for (const [code, roles] of Object.entries(RECIPIENT_ROLES_OF_SBF20)) {
      const target = notificationTarget(
        code,
        { type: 'SUBSCRIPTION', id: ID },
        { subscriptionId: ID, renewalId: null },
      );
      if (target === null) {
        closedRoutes.push(`${code}: no target`);
        continue;
      }
      const readers = rolesThatRead(target.operationId);
      const closed = roles.filter((role) => readers !== 'ANY' && !readers.includes(role));
      if (closed.length > 0) closedRoutes.push(`${code}: ${target.operationId} is closed to ${closed.join(', ')}`);
    }

    expect(closedRoutes).toEqual([]);
  });
});
