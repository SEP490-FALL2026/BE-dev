import { CatalogApi } from '../catalog/public/catalog.api';
import type { CatalogOnboardingFacts } from '../catalog/public/catalog.types';
import { DataImportApi } from '../data-import/public/data-import.api';
import { LatestEmployeeImport } from '../data-import/public/data-import.types';
import { IdentityAccessApi } from '../identity-access/public/identity-access.api';
import { LicensingApi } from '../licensing/public/licensing.api';
import type { BaselineProgress } from '../licensing/public/licensing.types';
import { OnboardingFacts } from '../organization/public/organization.types';
import { OrganizationApi } from '../organization/public/organization.api';
import { OnboardingForbiddenError } from './onboarding.errors';
import { OnboardingService } from './onboarding.service';

const facts = (overrides: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  activeDepartments: 3,
  activeEmployees: 40,
  departmentsWithoutCostCenter: [],
  departmentsWithoutHead: [],
  departmentsByItAdmin: [],
  ...overrides,
});

const catalogFacts = (overrides: Partial<CatalogOnboardingFacts> = {}): CatalogOnboardingFacts => ({
  applications: 4,
  plans: 6,
  subscriptions: 5,
  ...overrides,
});
const progress = (overrides: Partial<BaselineProgress> = {}): BaselineProgress => ({
  closed: false,
  closedAt: null,
  assignments: 0,
  ...overrides,
});

/** The service with in-memory collaborators; `checklist` is asked as an IT Admin unless the case names the roles. */
function serviceWith(
  organizationFacts: OnboardingFacts,
  latest: LatestEmployeeImport | null,
  usableItAdmins: string[] = [],
  catalog: CatalogOnboardingFacts = catalogFacts(),
  baseline: BaselineProgress = progress(),
) {
  const reads: string[] = [];
  const service = new OnboardingService(
    {
      getOnboardingFacts: () => {
        reads.push('organization');

        return Promise.resolve(organizationFacts);
      },
    } as unknown as OrganizationApi,
    {
      findUsableItAdminEmployeeIds: () => Promise.resolve(new Set(usableItAdmins)),
    } as unknown as IdentityAccessApi,
    { latestEmployeeImport: () => Promise.resolve(latest) } as unknown as DataImportApi,
    { getOnboardingFacts: () => Promise.resolve(catalog) } as unknown as CatalogApi,
    { getBaselineProgress: () => Promise.resolve(baseline) } as unknown as LicensingApi,
  );

  return { reads, checklist: (roles: readonly string[] = ['IT_ADMIN']) => service.checklist({ roles }) };
}

describe('onboarding checklist (US-02-04)', () => {
  it('has step 1 done when there are departments, people and no wrong row in the latest file (AC-1)', async () => {
    const { steps } = await serviceWith(facts(), null).checklist();

    expect(steps[0]).toMatchObject({ step: 1, status: 'DONE', reasons: [] });
  });

  describe('who reads it (F13, US-02-04 phạm vi quyền)', () => {
    it.each([['SUPER_ADMIN'], ['IT_ADMIN']])('lets the %s read it', async (role) => {
      const { steps } = await serviceWith(facts(), null).checklist([role]);

      expect(steps).toHaveLength(5);
    });

    it.each([['FINANCE'], ['MANAGER'], ['EMPLOYEE'], ['SPENDING_APPROVER']])(
      'refuses the %s before anything is read, whatever the route let through',
      async (role) => {
        const h = serviceWith(facts(), null);

        await expect(h.checklist([role])).rejects.toBeInstanceOf(OnboardingForbiddenError);
        expect(h.reads).toEqual([]);
      },
    );
  });

  it.each([
    ['no department', { activeDepartments: 0 }, null, ['NO_DEPARTMENT']],
    ['no person', { activeEmployees: 0 }, null, ['NO_EMPLOYEE']],
    [
      'a latest file that still has wrong rows (AC-6)',
      {},
      { errorRows: 2, status: 'COMPLETED' as const },
      ['IMPORT_HAS_ERRORS'],
    ],
    [
      'all three',
      { activeDepartments: 0, activeEmployees: 0 },
      { errorRows: 1, status: 'PREVIEW' as const },
      ['NO_DEPARTMENT', 'NO_EMPLOYEE', 'IMPORT_HAS_ERRORS'],
    ],
  ])('has step 1 incomplete with %s, and says why', async (_name, over, latest, reasons) => {
    const service = serviceWith(facts(over), latest ? { id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', ...latest } : null);

    const { steps } = await service.checklist();

    expect(steps[0]).toMatchObject({ status: 'INCOMPLETE', reasons });
  });

  it('lets a file with no wrong rows finish the step once the wrong ones are fixed (AC-6)', async () => {
    const wrong = await serviceWith(facts(), { id: 'i1', status: 'COMPLETED', errorRows: 2 }).checklist();
    const fixed = await serviceWith(facts(), { id: 'i2', status: 'COMPLETED', errorRows: 0 }).checklist();

    expect(wrong.steps[0].status).toBe('INCOMPLETE');
    expect(fixed.steps[0].status).toBe('DONE');
  });

  it('shows the latest people file by its id, status and wrong rows only, and nothing when there is none', async () => {
    const latest = await serviceWith(facts(), { id: 'i1', status: 'COMPLETED', errorRows: 2 }).checklist();
    const none = await serviceWith(facts(), null).checklist();

    expect(latest.steps[0].facts.latestImport).toEqual({ id: 'i1', status: 'COMPLETED', errorRows: 2 });
    expect(none.steps[0].facts.latestImport).toBeNull();
  });

  it('shows the departments without a head or an IT Admin as warnings, and still counts the step as done (AC-6)', async () => {
    const { steps } = await serviceWith(
      facts({
        departmentsWithoutHead: [{ code: 'P-OPS', name: 'Operations' }],
        departmentsByItAdmin: [
          { code: 'P-OPS', name: 'Operations', itAdminEmployeeId: null, itAdminStatus: null },
          { code: 'P-DES', name: 'Design', itAdminEmployeeId: 'it-1', itAdminStatus: 'ACTIVE' },
          { code: 'P-FIN', name: 'Finance', itAdminEmployeeId: 'it-2', itAdminStatus: 'TERMINATED' },
          { code: 'P-HR', name: 'People', itAdminEmployeeId: 'not-it', itAdminStatus: 'ACTIVE' },
        ],
      }),
      null,
      ['it-1', 'it-2'],
    ).checklist();

    expect(steps[0].status).toBe('DONE');
    expect(steps[0].warnings).toEqual([
      { code: 'MISSING_HEAD', departmentCode: 'P-OPS', departmentName: 'Operations' },
      { code: 'MISSING_IT_ADMIN', departmentCode: 'P-OPS', departmentName: 'Operations' },
      { code: 'MISSING_IT_ADMIN', departmentCode: 'P-FIN', departmentName: 'Finance' },
      { code: 'MISSING_IT_ADMIN', departmentCode: 'P-HR', departmentName: 'People' },
    ]);
  });

  it('says nothing of an activation or a free Cost Center any more: a department is created before its Cost Center (F14, QĐ-87d(1))', async () => {
    const { steps } = await serviceWith(
      facts({ departmentsWithoutCostCenter: [{ code: 'P-OPS', name: 'Operations' }] }),
      null,
    ).checklist(['SUPER_ADMIN']);

    expect(Object.keys(steps[0]).sort()).toEqual(['facts', 'key', 'reasons', 'status', 'step', 'warnings']);
    expect(JSON.stringify(steps[0])).not.toMatch(/AWAITING_ACTIVATION|NO_FREE_COST_CENTER/);
  });

  it('shows a department with no Cost Center as a warning that stops nothing (QĐ-87d(1))', async () => {
    const { steps } = await serviceWith(
      facts({ departmentsWithoutCostCenter: [{ code: 'P-OPS', name: 'Operations' }] }),
      null,
    ).checklist();

    expect(steps[0].status).toBe('DONE');
    expect(steps[0].warnings).toContainEqual({
      code: 'MISSING_COST_CENTER',
      departmentCode: 'P-OPS',
      departmentName: 'Operations',
    });
    expect(steps[0].facts.departmentsWithoutCostCenter).toBe(1);
  });

  describe('step 2, the applications (US-02-04, FR-9.1)', () => {
    it('is done when the catalog holds an application, and shows how many', async () => {
      const { steps } = await serviceWith(facts(), null, [], catalogFacts({ applications: 4 })).checklist();

      expect(steps[1]).toEqual({
        step: 2,
        key: 'APPLICATIONS',
        status: 'DONE',
        reasons: [],
        facts: { applications: 4 },
      });
    });

    it('is incomplete, and says so, while there is none', async () => {
      const { steps } = await serviceWith(facts(), null, [], catalogFacts({ applications: 0 })).checklist();

      expect(steps[1]).toMatchObject({ step: 2, status: 'INCOMPLETE', reasons: ['NO_APPLICATION'] });
    });
  });

  describe('step 3, the plans and the subscriptions (US-02-04 AC-2, AC-3)', () => {
    it('is done when there is a subscription, and shows the plans and subscriptions', async () => {
      const { steps } = await serviceWith(facts(), null, [], catalogFacts({ plans: 6, subscriptions: 5 })).checklist();

      expect(steps[2]).toEqual({
        step: 3,
        key: 'CONTRACTS_AND_SUBSCRIPTIONS',
        status: 'DONE',
        reasons: [],
        facts: { plans: 6, subscriptions: 5 },
      });
    });

    it.each([
      ['no plan and no subscription', { plans: 0, subscriptions: 0 }, ['NO_SUBSCRIPTION']],
      ['plans but no subscription', { plans: 3, subscriptions: 0 }, ['NO_SUBSCRIPTION']],
    ])('is incomplete with %s', async (_name, over, reasons) => {
      const { steps } = await serviceWith(facts(), null, [], catalogFacts(over)).checklist();

      expect(steps[2]).toMatchObject({ status: 'INCOMPLETE', reasons });
    });
  });

  describe('step 4, the seat baseline (US-02-04 AC-1, AC-2; US-02-05 AC-6)', () => {
    it('is ready, not blocked, once steps 1 and 3 are done: INCOMPLETE with no reason and the count of seats so far (AC-1)', async () => {
      const { steps } = await serviceWith(facts(), null, [], catalogFacts(), progress({ assignments: 70 })).checklist();

      expect(steps[3]).toEqual({
        step: 4,
        key: 'SEAT_BASELINE',
        status: 'INCOMPLETE',
        reasons: [],
        facts: { assignments: 70, closed: false, closedAt: null },
      });
    });

    it('is blocked while step 3 has no subscription, and says it needs step 3 (AC-2)', async () => {
      const { steps } = await serviceWith(facts(), null, [], catalogFacts({ subscriptions: 0 })).checklist();

      expect(steps[3]).toMatchObject({ status: 'BLOCKED', reasons: ['STEP_3_INCOMPLETE'] });
    });

    it('is blocked while step 1 is incomplete, and names both when both are (BR-01.1)', async () => {
      const first = await serviceWith(facts({ activeDepartments: 0 }), null).checklist();
      const both = await serviceWith(
        facts({ activeEmployees: 0 }),
        null,
        [],
        catalogFacts({ subscriptions: 0 }),
      ).checklist();

      expect(first.steps[3]).toMatchObject({ status: 'BLOCKED', reasons: ['STEP_1_INCOMPLETE'] });
      expect(both.steps[3]).toMatchObject({ status: 'BLOCKED', reasons: ['STEP_1_INCOMPLETE', 'STEP_3_INCOMPLETE'] });
    });

    it('is done when the IT Admin has closed it (OI-10), with when, whatever the other steps say', async () => {
      const closedAt = new Date('2026-10-20T03:00:00.000Z');
      const { steps } = await serviceWith(
        facts(),
        null,
        [],
        catalogFacts(),
        progress({ closed: true, closedAt, assignments: 70 }),
      ).checklist();

      expect(steps[3]).toMatchObject({
        status: 'DONE',
        reasons: [],
        facts: { assignments: 70, closed: true, closedAt: '2026-10-20T03:00:00.000Z' },
      });
    });
  });

  it('says that the usage step is not built yet, and does not pretend it is done (US-02-04 step 5)', async () => {
    const { steps } = await serviceWith(facts(), null).checklist();

    expect(steps[4]).toEqual({ step: 5, key: 'USAGE', status: 'NOT_AVAILABLE', reasons: ['NOT_BUILT_YET'] });
  });

  it('has five steps and nothing else: the standard toolset is not suggested any more (QĐ-87h)', async () => {
    const checklist = await serviceWith(facts(), null).checklist();

    expect(Object.keys(checklist)).toEqual(['steps']);
    expect(checklist.steps).toHaveLength(5);
  });
});
