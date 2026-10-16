import { EmployeeImportService } from '../data-import/employee-import.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { OnboardingFacts } from '../organization/organization.types';
import { OrganizationService } from '../organization/organization.service';
import { OnboardingService } from './onboarding.service';

const facts = (overrides: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  activeDepartments: 3,
  activeEmployees: 40,
  freeCostCenters: 1,
  departmentsWithoutHead: [],
  departmentsByItAdmin: [],
  ...overrides,
});

function serviceWith(
  organizationFacts: OnboardingFacts,
  latest: { id: string; status: 'PREVIEW' | 'COMPLETED' | 'CANCELLED'; errorRows: number; createdAt: Date } | null,
  usableItAdmins: string[] = [],
): OnboardingService {
  return new OnboardingService(
    { getOnboardingFacts: () => Promise.resolve(organizationFacts) } as unknown as OrganizationService,
    {
      findUsableItAdminEmployeeIds: () => Promise.resolve(new Set(usableItAdmins)),
    } as unknown as IdentityAccessService,
    { latestImport: () => Promise.resolve(latest) } as unknown as EmployeeImportService,
  );
}

describe('onboarding checklist (US-02-04)', () => {
  it('has step 1 done when there are departments, people and no wrong row in the latest file (AC-1)', async () => {
    const { steps } = await serviceWith(facts(), null).checklist();

    expect(steps[0]).toMatchObject({ step: 1, status: 'DONE', reasons: [], createDepartmentBlockedBy: null });
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
    const service = serviceWith(
      facts(over),
      latest ? { id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', createdAt: new Date(), ...latest } : null,
    );

    const { steps } = await service.checklist();

    expect(steps[0]).toMatchObject({ status: 'INCOMPLETE', reasons });
  });

  it('lets a file with no wrong rows finish the step once the wrong ones are fixed (AC-6)', async () => {
    const wrong = await serviceWith(facts(), {
      id: 'i1',
      status: 'COMPLETED',
      errorRows: 2,
      createdAt: new Date(),
    }).checklist();
    const fixed = await serviceWith(facts(), {
      id: 'i2',
      status: 'COMPLETED',
      errorRows: 0,
      createdAt: new Date(),
    }).checklist();

    expect(wrong.steps[0].status).toBe('INCOMPLETE');
    expect(fixed.steps[0].status).toBe('DONE');
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

  it('says that creating a department waits for Finance when no cost center is free (AC-4)', async () => {
    const { steps } = await serviceWith(facts({ freeCostCenters: 0 }), null).checklist();

    expect(steps[0].createDepartmentBlockedBy).toBe('NO_FREE_COST_CENTER');
  });

  it('keeps the seat step blocked, and says by what, and says the others are not built (AC-2)', async () => {
    const done = (await serviceWith(facts(), null).checklist()).steps;
    const incomplete = (await serviceWith(facts({ activeDepartments: 0 }), null).checklist()).steps;

    expect(done.slice(1).map((step) => [step.step, step.status, step.reasons])).toEqual([
      [2, 'NOT_AVAILABLE', ['NOT_BUILT_YET']],
      [3, 'NOT_AVAILABLE', ['NOT_BUILT_YET']],
      [4, 'BLOCKED', ['STEP_3_NOT_AVAILABLE']],
      [5, 'NOT_AVAILABLE', ['NOT_BUILT_YET']],
    ]);
    expect(incomplete[3]).toMatchObject({ status: 'BLOCKED', reasons: ['STEP_1_INCOMPLETE', 'STEP_3_NOT_AVAILABLE'] });
  });
});
