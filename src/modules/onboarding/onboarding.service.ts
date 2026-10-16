import { Injectable } from '@nestjs/common';
import { EmployeeImportService } from '../data-import/employee-import.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { OrganizationService } from '../organization/organization.service';

export type StepStatus = 'DONE' | 'INCOMPLETE' | 'BLOCKED' | 'NOT_AVAILABLE';

export type OrganizationStepReason = 'NO_DEPARTMENT' | 'NO_EMPLOYEE' | 'IMPORT_HAS_ERRORS';

export interface OrganizationStep {
  step: 1;
  key: 'ORGANIZATION_AND_PEOPLE';
  status: 'DONE' | 'INCOMPLETE';
  reasons: OrganizationStepReason[];
  facts: {
    activeDepartments: number;
    activeEmployees: number;
    freeCostCenters: number;
    latestImport: { id: string; status: 'PREVIEW' | 'COMPLETED'; errorRows: number } | null;
  };
  /** Set when a department cannot be created yet because Finance has not made a cost center for it (AC-4). */
  createDepartmentBlockedBy: 'NO_FREE_COST_CENTER' | null;
  /** Gaps that never stop the step, only show in it (US-02-04 AC-6). */
  warnings: { code: 'MISSING_HEAD' | 'MISSING_IT_ADMIN'; departmentCode: string; departmentName: string }[];
}

export interface LaterStep {
  step: 2 | 3 | 4 | 5;
  key: 'APPLICATIONS' | 'CONTRACTS_AND_SUBSCRIPTIONS' | 'SEAT_BASELINE' | 'USAGE';
  status: 'BLOCKED' | 'NOT_AVAILABLE';
  reasons: ('NOT_BUILT_YET' | 'STEP_1_INCOMPLETE' | 'STEP_3_NOT_AVAILABLE')[];
}

export interface OnboardingChecklist {
  steps: [OrganizationStep, LaterStep, LaterStep, LaterStep, LaterStep];
}

/**
 * The onboarding checklist (`US-02-04`). Each step is judged from the data that exists, not from how it was entered.
 * Step 1 is done when there is a department and a person and the latest people file has no wrong row; a department
 * without a head or without an IT Admin in charge is a warning inside it and stops nothing (`QĐ-66d`). Steps 2 to 5
 * need the application catalogue, the subscriptions and the seats, which are not built yet, so they say so and step 4
 * says what it waits for; they join this checklist when those exist.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly imports: EmployeeImportService,
  ) {}

  async checklist(): Promise<OnboardingChecklist> {
    const [facts, latest] = await Promise.all([this.organization.getOnboardingFacts(), this.imports.latestImport()]);
    const usableItAdmins = await this.identity.findUsableItAdminEmployeeIds(
      facts.departmentsByItAdmin.flatMap((department) =>
        department.itAdminEmployeeId ? [department.itAdminEmployeeId] : [],
      ),
    );

    const reasons: OrganizationStepReason[] = [
      ...(facts.activeDepartments === 0 ? (['NO_DEPARTMENT'] as const) : []),
      ...(facts.activeEmployees === 0 ? (['NO_EMPLOYEE'] as const) : []),
      ...(latest && latest.errorRows > 0 ? (['IMPORT_HAS_ERRORS'] as const) : []),
    ];
    const first: OrganizationStep = {
      step: 1,
      key: 'ORGANIZATION_AND_PEOPLE',
      status: reasons.length === 0 ? 'DONE' : 'INCOMPLETE',
      reasons,
      facts: {
        activeDepartments: facts.activeDepartments,
        activeEmployees: facts.activeEmployees,
        freeCostCenters: facts.freeCostCenters,
        latestImport:
          latest && latest.status !== 'CANCELLED'
            ? { id: latest.id, status: latest.status, errorRows: latest.errorRows }
            : null,
      },
      createDepartmentBlockedBy: facts.freeCostCenters === 0 ? 'NO_FREE_COST_CENTER' : null,
      warnings: [
        ...facts.departmentsWithoutHead.map((department) => ({
          code: 'MISSING_HEAD' as const,
          departmentCode: department.code,
          departmentName: department.name,
        })),
        ...facts.departmentsByItAdmin
          .filter(
            (department) =>
              department.itAdminEmployeeId === null ||
              department.itAdminStatus !== 'ACTIVE' ||
              !usableItAdmins.has(department.itAdminEmployeeId),
          )
          .map((department) => ({
            code: 'MISSING_IT_ADMIN' as const,
            departmentCode: department.code,
            departmentName: department.name,
          })),
      ],
    };
    const notBuilt = (step: 2 | 3 | 5, key: LaterStep['key']): LaterStep => ({
      step,
      key,
      status: 'NOT_AVAILABLE',
      reasons: ['NOT_BUILT_YET'],
    });

    return {
      steps: [
        first,
        notBuilt(2, 'APPLICATIONS'),
        notBuilt(3, 'CONTRACTS_AND_SUBSCRIPTIONS'),
        {
          step: 4,
          key: 'SEAT_BASELINE',
          status: 'BLOCKED',
          // Seats need the subscriptions of step 3 (AC-2), and people before them.
          reasons: [...(first.status === 'DONE' ? [] : (['STEP_1_INCOMPLETE'] as const)), 'STEP_3_NOT_AVAILABLE'],
        },
        notBuilt(5, 'USAGE'),
      ],
    };
  }
}
