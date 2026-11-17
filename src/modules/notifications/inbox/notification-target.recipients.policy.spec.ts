import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IN_APP_NOTIFICATION_CODES } from '../public/notifications.types';
import { PARAM_KEYS_BY_CODE } from './inbox.policy';
import {
  ALTERNATIVES,
  ROUTE_READERS,
  TARGET_BY_CODE,
  TARGET_BY_SUBJECT_TYPE,
  notificationTarget,
} from './notification-target.policy';

const ID = '11111111-1111-4111-8111-111111111111';
const HTTP_METHOD = /@(?:Get|Post|Put|Patch|Delete)\(/g;
const ROLE_DECORATOR = /@(?:RequireRoles|RequireRolesOrGrants)\(\s*\[?([^)\]]*)/;

/** Every role a person can hold (`AuthenticatedPrincipal.roles`); a reader of one role is judged by that role alone. */
const ROLES = ['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'SPENDING_APPROVER', 'MANAGER', 'EMPLOYEE'] as const;

/**
 * Routes with no role guard whose service narrows the reader (read in the service and in the 403 of the controller, not in the decorator):
 * `budgetVersionGet` (only Finance and the spending approver read a version), `budgetProposalGet` (Finance every proposal, a head those
 * of their Cost Center), `subscriptionRenewalGet` (`SUBSCRIPTION_RENEWAL.READ_FORBIDDEN`: IT Admin, Finance, the head of the owner).
 */
const NARROWED_BY_SERVICE: Readonly<Record<string, readonly string[]>> = {
  budgetVersionGet: ['FINANCE', 'SPENDING_APPROVER'],
  budgetProposalGet: ['FINANCE', 'MANAGER'],
  subscriptionRenewalGet: ['IT_ADMIN', 'FINANCE', 'MANAGER'],
};

const rolesIn = (decorator: string): string[] => [...decorator.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);

/**
 * The roles that read the route of an operation, taken from the `@RequireRoles`/`@RequireRolesOrGrants` of its method, or else of its
 * controller class, or `'ANY'` for `@AuthenticatedOnly`: `openapi.json` does not carry the roles of a route.
 */
function rolesThatRead(operationId: string): readonly string[] | 'ANY' {
  const known = ROLES_OF_ROUTE.get(operationId);
  if (known !== undefined) return known;
  const found = scanControllers(operationId);
  ROLES_OF_ROUTE.set(operationId, found);

  return found;
}

const ROLES_OF_ROUTE = new Map<string, readonly string[] | 'ANY'>();

function scanControllers(operationId: string): readonly string[] | 'ANY' {
  const root = join(__dirname, '../..');
  for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.controller.ts')) continue;
    const text = readFileSync(join(root, file), 'utf8');
    const at = text.indexOf(`operationId: '${operationId}'`);
    if (at < 0) continue;
    const before = text.slice(0, at);
    const method = [...before.matchAll(HTTP_METHOD)].at(-1);
    const own = text.slice(method?.index ?? at, at);
    const found = ROLE_DECORATOR.exec(own);
    if (found) return rolesIn(found[1]);
    if (own.includes('@AuthenticatedOnly')) return 'ANY';
    const classAt = before.lastIndexOf('export class');
    const head = before.slice(before.lastIndexOf('@Controller'), classAt);
    const onClass = ROLE_DECORATOR.exec(head);
    if (onClass) return rolesIn(onClass[1]);
    if (head.includes('@AuthenticatedOnly')) return 'ANY';
    throw new Error(`${operationId} has no @RequireRoles or @AuthenticatedOnly on its method or class`);
  }
  throw new Error(`no controller declares ${operationId}`);
}

/** The roles that really read a route: the service narrows the controller where `NARROWED_BY_SERVICE` says so. */
function readers(operationId: string): readonly string[] | 'ANY' {
  return NARROWED_BY_SERVICE[operationId] ?? rolesThatRead(operationId);
}

const allOperations = (): string[] => {
  const found = new Set<string>(Object.keys(ROUTE_READERS));
  const add = (ref: { operationId: string }): void => void found.add(ref.operationId);
  for (const entry of Object.values(TARGET_BY_CODE)) {
    if (entry === null || entry === undefined) continue;
    if ('by' in entry) {
      Object.values(entry.cases).forEach(add);
      if (entry.otherwise) add(entry.otherwise);
    } else add(entry);
  }
  Object.values(TARGET_BY_SUBJECT_TYPE).forEach(add);
  for (const alternatives of Object.values(ALTERNATIVES)) alternatives.forEach(({ route }) => add(route));

  return [...found].sort();
};

describe('the roles of the routes a notice opens', () => {
  it('reads the roles of a route from its method, its class or its service', () => {
    expect(rolesThatRead('subscriptionGet')).toEqual(['IT_ADMIN', 'FINANCE']);
    expect(rolesThatRead('budgetMine')).toEqual(['MANAGER']);
    expect(rolesThatRead('employeeGet')).toEqual(['SUPER_ADMIN']);
    expect(rolesThatRead('usageSourceList')).toEqual(['IT_ADMIN']);
    expect(rolesThatRead('meDepartmentTransferGet')).toBe('ANY');
    expect(readers('budgetVersionGet')).toEqual(['FINANCE', 'SPENDING_APPROVER']);
  });

  it('is said by ROUTE_READERS for every route of every table: a route open to all is not listed, any other is, as the controller says', () => {
    const wrong: string[] = [];
    for (const operationId of allOperations()) {
      const truth = readers(operationId);
      const said = ROUTE_READERS[operationId];
      if (truth === 'ANY') {
        if (said !== undefined) wrong.push(`${operationId}: listed for ${said.join(',')} but open to all`);
      } else if (said === undefined || [...said].sort().join() !== [...truth].sort().join()) {
        wrong.push(`${operationId}: is read by ${truth.join(',')}, the table says ${said?.join(',') ?? 'all'}`);
      }
    }

    expect(wrong).toEqual([]);
  });
});

/** The audiences, and whether the notice is about the reader, that a table of a code tells apart. */
const AUDIENCES = [undefined, 'MOVER', 'HEAD', 'IT_ADMIN', 'EMPLOYEE'] as const;

function* everyNotice(): Generator<{
  code: string;
  subject: { type: string; id: string } | null;
  params: Record<string, unknown>;
}> {
  const subjectTypes = new Set([
    ...Object.keys(TARGET_BY_SUBJECT_TYPE),
    'APPLICATION',
    'COST_CENTER',
    'TRANSFER_REVIEW',
  ]);
  for (const code of IN_APP_NOTIFICATION_CODES) {
    const base = Object.fromEntries(PARAM_KEYS_BY_CODE[code].map((key) => [key, ID]));
    for (const audience of AUDIENCES) {
      for (const self of ['true', 'false']) {
        const params = { ...base, ...(audience === undefined ? {} : { audience }), recipientIsSubject: self };
        yield { code, subject: null, params };
        for (const type of subjectTypes) yield { code, subject: { type, id: ID }, params };
      }
    }
  }
}

describe('the route a notice opens, for every role that may be told of it', () => {
  it('is a route that the reader can read, or none, for every code, subject, audience and role', () => {
    const closed = new Set<string>();
    let opened = 0;
    for (const { code, subject, params } of everyNotice()) {
      for (const role of ROLES) {
        const target = notificationTarget(code, subject, params, [role]);
        if (target === null) continue;
        opened += 1;
        const who = readers(target.operationId);
        if (who !== 'ANY' && !who.includes(role)) closed.add(`${code} -> ${target.operationId} is closed to ${role}`);
      }
    }

    expect([...closed].sort()).toEqual([]);
    expect(opened).toBeGreaterThan(1000);
  });
});

/** The recipients of the notices of the report F1 (`SMOKE-MUTATION`), from `BudgetNotifier` and `PersonnelNotifier`. */
describe('the notices a head of a department, a mover and Finance open', () => {
  const cycle = { type: 'BUDGET_CYCLE', id: ID };
  const version = { type: 'BUDGET_VERSION', id: ID };
  const target = (
    code: string,
    subject: { type: string; id: string },
    params: Record<string, unknown>,
    roles: readonly string[],
  ) => notificationTarget(code, subject, params, roles);

  it('sends the head to the budget of their department, not to the cycle or the version of the company', () => {
    expect(target('BUDGET_CYCLE_OPENED', cycle, { cycleId: ID, year: 2027 }, ['EMPLOYEE', 'MANAGER'])).toEqual({
      operationId: 'budgetMine',
      pathParams: {},
    });
    expect(target('BUDGET_VERSION_DECIDED', version, { versionId: ID }, ['EMPLOYEE', 'MANAGER'])).toEqual({
      operationId: 'budgetMineVersionList',
      pathParams: {},
    });
  });

  it('keeps the route of Finance and of the spending approver', () => {
    expect(target('BUDGET_VERSION_DECIDED', version, { versionId: ID }, ['FINANCE'])).toEqual({
      operationId: 'budgetVersionGet',
      pathParams: { id: ID },
    });
    expect(target('BUDGET_CYCLE_OPENED', cycle, { year: 2027 }, ['SPENDING_APPROVER'])).toEqual({
      operationId: 'budgetCycleGet',
      pathParams: { year: '2027' },
    });
  });

  it('gives an employee a route for their own transfer or departure, and nobody else a route they cannot read', () => {
    const transfer = { type: 'DEPARTMENT_TRANSFER', id: ID };
    const departure = { type: 'OFFBOARDING_CASE', id: ID };
    const self = { employeeId: ID, recipientIsSubject: 'true' };
    const other = { employeeId: ID, recipientIsSubject: 'false' };
    expect(target('PERSONNEL_EVENT_RECORDED', transfer, self, ['EMPLOYEE'])).toEqual({
      operationId: 'meDepartmentTransferGet',
      pathParams: {},
    });
    expect(target('PERSONNEL_EVENT_RECORDED', departure, self, ['EMPLOYEE'])).toEqual({
      operationId: 'meDepartureNoticeGet',
      pathParams: {},
    });
    expect(target('PERSONNEL_EVENT_RECORDED', departure, other, ['EMPLOYEE', 'MANAGER'])).toBeNull();
    expect(target('PERSONNEL_EVENT_RECORDED', transfer, other, ['EMPLOYEE', 'MANAGER'])).toBeNull();
    expect(target('PERSONNEL_EVENT_RECORDED', departure, other, ['IT_ADMIN'])).toEqual({
      operationId: 'offboardingCaseGet',
      pathParams: { id: ID },
    });
    expect(target('PERSONNEL_EVENT_RECORDED', transfer, other, ['SUPER_ADMIN'])).toEqual({
      operationId: 'departmentTransferGet',
      pathParams: { id: ID },
    });
  });
});
