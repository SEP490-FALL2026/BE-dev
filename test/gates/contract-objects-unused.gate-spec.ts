import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The compatibility release does not use the objects the release after it deletes (`g0-g6-final-business-baseline-remediation`,
 * Task 1.4a, spec L.10, review `P03-RV-03`): the migrations of the final release drop them while the image that is running, or the
 * one H7 recovers to after a failed deploy, is still this one. Every such object is named here with the way source reaches it; no
 * file of `src` outside `src/generated` and the pre-migration inventory (`ops:preflight`, which reads them only after a probe of
 * the schema) may reach any of them. Prisma does not help by itself: an `@ignore`d column or model is simply missing from the
 * client, so this gate also catches the raw SQL that bypasses it.
 */
interface ContractObject {
  /** The finding the final release closes by deleting it. */
  finding: 'F01' | 'F03' | 'F04' | 'F05' | 'F06';
  object: string;
  /** How source names it: table, column, function, trigger or a Prisma model accessor. */
  pattern: RegExp;
}

const word = (name: string): RegExp => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);

export const CONTRACT_OBJECTS: readonly ContractObject[] = [
  // F01 — a Cost Center belongs to one department: `cost_centers.department_id` replaces `departments.cost_center_id`.
  {
    finding: 'F01',
    object: 'column departments.cost_center_id',
    pattern: /(?<![A-Za-z0-9_])d\."?cost_center_id"?|departments\.cost_center_id/,
  },
  {
    finding: 'F01',
    object: 'trigger departments_cost_center_link_forward',
    pattern: word('departments_cost_center_link_forward'),
  },
  {
    finding: 'F01',
    object: 'trigger cost_centers_department_link_backward',
    pattern: word('cost_centers_department_link_backward'),
  },
  {
    finding: 'F01',
    object: 'function departments_require_unit_cost_center',
    pattern: word('departments_require_unit_cost_center'),
  },
  // F03 — the job title is free text on the person: the catalogue and its four columns go.
  { finding: 'F03', object: 'table job_titles', pattern: word('job_titles') },
  { finding: 'F03', object: 'column job_title_id (placement, review)', pattern: word('job_title_id') },
  { finding: 'F03', object: 'column from_job_title_id', pattern: word('from_job_title_id') },
  { finding: 'F03', object: 'column to_job_title_id', pattern: word('to_job_title_id') },
  { finding: 'F03', object: 'trigger employees_job_title_forward', pattern: word('employees_job_title_forward') },
  { finding: 'F03', object: 'trigger job_title_id_backfill', pattern: word('job_title_id_backfill') },
  { finding: 'F03', object: 'function job_title_display_name', pattern: word('job_title_display_name') },
  { finding: 'F03', object: 'function job_title_id_of_employee', pattern: word('job_title_id_of_employee') },
  {
    finding: 'F03',
    object: 'Prisma model JobTitle',
    pattern: /(?:\btx|\bprisma|\bdb|this\.prisma)\.jobTitle\b|\bJobTitle(?:Status)?\b(?!Brief)/,
  },
  // F04 — no standard toolset, no "outside the standard toolset" flag.
  { finding: 'F04', object: 'table standard_toolsets', pattern: word('standard_toolsets') },
  { finding: 'F04', object: 'table standard_toolset_versions', pattern: word('standard_toolset_versions') },
  { finding: 'F04', object: 'table standard_toolset_items', pattern: word('standard_toolset_items') },
  { finding: 'F04', object: 'column access_requests.outside_standard', pattern: word('outside_standard') },
  {
    finding: 'F04',
    object: 'column access_requests.outside_standard_reason',
    pattern: word('outside_standard_reason'),
  },
  {
    finding: 'F04',
    object: 'Prisma models StandardToolset*',
    pattern: /\.standardToolset(?:Version|Item)?\b|\bStandardToolset(?:Version|Item)?\b/,
  },
  {
    finding: 'F04',
    object: 'Prisma fields outsideStandard, outsideStandardReason',
    pattern: /\boutsideStandard(?:Reason)?\b/,
  },
  // F05 — no allocation of a subscription by ratio.
  { finding: 'F05', object: 'table subscription_cost_allocations', pattern: word('subscription_cost_allocations') },
  {
    finding: 'F05',
    object: 'table subscription_cost_allocation_versions',
    pattern: word('subscription_cost_allocation_versions'),
  },
  {
    finding: 'F05',
    object: 'table subscription_cost_allocation_lines',
    pattern: word('subscription_cost_allocation_lines'),
  },
  {
    finding: 'F05',
    object: 'Prisma models SubscriptionCostAllocation*',
    pattern: /\.subscriptionCostAllocation(?:Version|Line)?\b|\bSubscriptionCostAllocation(?:Version|Line)?\b/,
  },
  // F06 — no move of a service account to another department.
  { finding: 'F06', object: 'table service_account_moves', pattern: word('service_account_moves') },
  { finding: 'F06', object: 'function service_account_move_guard', pattern: word('service_account_move_guard') },
  {
    finding: 'F06',
    object: 'Prisma model ServiceAccountMove',
    pattern: /\.serviceAccountMove\b|\bServiceAccountMove(?:Status|ConfirmerRole)?\b/,
  },
];

/**
 * The only files that may name an object of the list: the inventory `ops:preflight` reads before any migration, after probing
 * the schema (`to_regclass`, `information_schema`) for it.
 */
export const PRE_MIGRATION_INVENTORY: ReadonlySet<string> = new Set([
  'modules/installation/migration-preflight/migration-preflight.repo.ts',
]);

const SOURCE_ROOT = join(__dirname, '..', '..', 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(path);

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Source without its comments: a comment may say what was removed, and code may not name it. */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** The objects a piece of source reaches, by the pattern of each. */
export function objectsReached(source: string): string[] {
  const code = withoutComments(source);

  return CONTRACT_OBJECTS.filter(({ pattern }) => pattern.test(code)).map(
    ({ finding, object }) => `${finding} ${object}`,
  );
}

describe('the compatibility release does not use what the release after it deletes (spec L.10, F01, F03, F04, F05, F06)', () => {
  const files = sourceFiles(SOURCE_ROOT).map((path) => ({
    path: relative(SOURCE_ROOT, path).split(sep).join('/'),
    source: readFileSync(path, 'utf8'),
  }));

  it('reads source files at all', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('names no table, column, function, trigger or Prisma model of the list in any file of src outside generated and the pre-migration inventory', () => {
    const reached = files
      .filter(({ path }) => !PRE_MIGRATION_INVENTORY.has(path))
      .flatMap(({ path, source }) => objectsReached(source).map((object) => `${path}: ${object}`));

    expect(reached).toEqual([]);
  });

  it('lets the pre-migration inventory name them only behind a probe of the schema', () => {
    for (const path of PRE_MIGRATION_INVENTORY) {
      const source = files.find((file) => file.path === path)?.source ?? '';

      expect(source).toContain('to_regclass');
      expect(source).toContain('information_schema');
    }
  });

  describe('self-test: the gate catches a reference when one is planted', () => {
    it.each(CONTRACT_OBJECTS.map(({ finding, object }) => [`${finding} ${object}`] as const))(
      '%s is a pattern some planted line reaches',
      (label) => {
        const planted: Record<string, string> = {
          'F01 column departments.cost_center_id': 'SELECT d."cost_center_id" FROM departments d',
          'F01 trigger departments_cost_center_link_forward':
            "-- no: code\nconst t = 'departments_cost_center_link_forward';",
          'F01 trigger cost_centers_department_link_backward': "const t = 'cost_centers_department_link_backward';",
          'F01 function departments_require_unit_cost_center': "const f = 'departments_require_unit_cost_center';",
          'F03 table job_titles': 'SELECT id FROM job_titles',
          'F03 column job_title_id (placement, review)': 'SELECT job_title_id FROM employee_placements',
          'F03 column from_job_title_id': 'SELECT from_job_title_id FROM department_transfers',
          'F03 column to_job_title_id': 'SELECT to_job_title_id FROM department_transfers',
          'F03 trigger employees_job_title_forward': "const t = 'employees_job_title_forward';",
          'F03 trigger job_title_id_backfill': "const t = 'job_title_id_backfill';",
          'F03 function job_title_display_name': "const f = 'job_title_display_name';",
          'F03 function job_title_id_of_employee': "const f = 'job_title_id_of_employee';",
          'F03 Prisma model JobTitle': 'await tx.jobTitle.findMany();',
          'F04 table standard_toolsets': 'SELECT 1 FROM standard_toolsets',
          'F04 table standard_toolset_versions': 'SELECT 1 FROM standard_toolset_versions',
          'F04 table standard_toolset_items': 'SELECT 1 FROM standard_toolset_items',
          'F04 column access_requests.outside_standard': 'SELECT outside_standard FROM access_requests',
          'F04 column access_requests.outside_standard_reason': 'SELECT outside_standard_reason FROM access_requests',
          'F04 Prisma models StandardToolset*': 'await tx.standardToolset.findMany();',
          'F04 Prisma fields outsideStandard, outsideStandardReason': 'const x = { outsideStandard: true };',
          'F05 table subscription_cost_allocations': 'SELECT 1 FROM subscription_cost_allocations',
          'F05 table subscription_cost_allocation_versions': 'SELECT 1 FROM subscription_cost_allocation_versions',
          'F05 table subscription_cost_allocation_lines': 'SELECT 1 FROM subscription_cost_allocation_lines',
          'F05 Prisma models SubscriptionCostAllocation*': 'await tx.subscriptionCostAllocation.findMany();',
          'F06 table service_account_moves': 'SELECT 1 FROM service_account_moves',
          'F06 function service_account_move_guard': "const f = 'service_account_move_guard';",
          'F06 Prisma model ServiceAccountMove': 'await tx.serviceAccountMove.findMany();',
        };

        expect(planted[label]).toBeDefined();
        expect(objectsReached(planted[label])).toContain(label);
      },
    );

    it('ignores a comment, a longer name and the free-text job title of a person', () => {
      expect(objectsReached('// the old job_titles table is gone\n/* standard_toolsets too */')).toEqual([]);
      expect(
        objectsReached('const a = job_titles_count; const b = employee.jobTitle; const c = costCenterId;'),
      ).toEqual([]);
    });
  });
});
