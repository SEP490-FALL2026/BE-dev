import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../catalog/catalog.service';
import { DataImportService } from '../data-import/data-import.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { LicensingService } from '../licensing/licensing.service';
import { OrganizationService } from '../organization/organization.service';
import { assertMayReadChecklist } from './onboarding.policy';

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
    /** Active departments that have no Cost Center in use yet (Finance creates one for each, `QĐ-87d(1)`). */
    departmentsWithoutCostCenter: number;
    latestImport: { id: string; status: 'PREVIEW' | 'COMPLETED'; errorRows: number } | null;
  };
  /** Gaps that never stop the step, only show in it (US-02-04 AC-6). */
  warnings: {
    code: 'MISSING_HEAD' | 'MISSING_IT_ADMIN' | 'MISSING_COST_CENTER';
    departmentCode: string;
    departmentName: string;
  }[];
}

/** A step after the first: judged from the catalog and the seats that exist, not from how they were entered. */
export interface DataStep {
  step: 2 | 3 | 4;
  key: 'APPLICATIONS' | 'CONTRACTS_AND_SUBSCRIPTIONS' | 'SEAT_BASELINE';
  status: 'DONE' | 'INCOMPLETE' | 'BLOCKED';
  reasons: ('NO_APPLICATION' | 'NO_SUBSCRIPTION' | 'STEP_1_INCOMPLETE' | 'STEP_3_INCOMPLETE')[];
  facts:
    | { applications: number }
    | { plans: number; subscriptions: number }
    | { assignments: number; closed: boolean; closedAt: string | null };
}

/** A step whose data does not exist yet (the usage step): it says so and is never shown as done. */
export interface LaterStep {
  step: 5;
  key: 'USAGE';
  status: 'NOT_AVAILABLE';
  reasons: 'NOT_BUILT_YET'[];
}

export interface OnboardingChecklist {
  steps: [OrganizationStep, DataStep, DataStep, DataStep, LaterStep];
}

/**
 * The onboarding checklist (`US-02-04`). Each step is judged from the data that exists, not from how it was entered.
 * Step 1 is done when there is a department and a person and the latest people file has no wrong row; a department
 * without a head, without an IT Admin in charge or without a Cost Center is a warning inside it and stops nothing (`QĐ-87f(2)`:
 * Finance creates the Cost Center for a department that exists, after it). Step 2 is done
 * when the catalog holds an application, step 3 when it holds a subscription; step 4, the seat baseline, is blocked
 * until steps 1 and 3 are done (`BR-01.1`), ready after, and done when the IT Admin closes it (`OI-10`). Step 5, the
 * usage, is not built yet and says so. Nothing is only suggested any more: the standard toolset is gone (`QĐ-87h`).
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly imports: DataImportService,
    private readonly catalog: CatalogService,
    private readonly licensing: LicensingService,
  ) {}

  /** The Super Admin and the IT Admin read it, and nobody else: OnboardingForbiddenError. */
  async checklist(actor: Pick<AuthenticatedPrincipal, 'roles'>): Promise<OnboardingChecklist> {
    assertMayReadChecklist(actor.roles);
    const [facts, latest, catalog, baseline] = await Promise.all([
      this.organization.getOnboardingFacts(),
      this.imports.latestEmployeeImport(),
      this.catalog.getOnboardingFacts(),
      this.licensing.getBaselineProgress(),
    ]);
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
        departmentsWithoutCostCenter: facts.departmentsWithoutCostCenter.length,
        latestImport: latest ? { id: latest.id, status: latest.status, errorRows: latest.errorRows } : null,
      },
      warnings: [
        ...facts.departmentsWithoutCostCenter.map((department) => ({
          code: 'MISSING_COST_CENTER' as const,
          departmentCode: department.code,
          departmentName: department.name,
        })),
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
    const second: DataStep = {
      step: 2,
      key: 'APPLICATIONS',
      status: catalog.applications > 0 ? 'DONE' : 'INCOMPLETE',
      reasons: catalog.applications > 0 ? [] : ['NO_APPLICATION'],
      facts: { applications: catalog.applications },
    };
    const third: DataStep = {
      step: 3,
      key: 'CONTRACTS_AND_SUBSCRIPTIONS',
      status: catalog.subscriptions > 0 ? 'DONE' : 'INCOMPLETE',
      reasons: catalog.subscriptions > 0 ? [] : ['NO_SUBSCRIPTION'],
      facts: { plans: catalog.plans, subscriptions: catalog.subscriptions },
    };
    // Seats need the people of step 1 and the subscriptions of step 3 (BR-01.1); closing is what completes the step.
    const blockedBy: DataStep['reasons'] = [
      ...(first.status === 'DONE' ? [] : (['STEP_1_INCOMPLETE'] as const)),
      ...(third.status === 'DONE' ? [] : (['STEP_3_INCOMPLETE'] as const)),
    ];
    const fourth: DataStep = {
      step: 4,
      key: 'SEAT_BASELINE',
      status: baseline.closed ? 'DONE' : blockedBy.length > 0 ? 'BLOCKED' : 'INCOMPLETE',
      reasons: baseline.closed ? [] : blockedBy,
      facts: {
        assignments: baseline.assignments,
        closed: baseline.closed,
        closedAt: baseline.closedAt ? baseline.closedAt.toISOString() : null,
      },
    };

    return {
      steps: [
        first,
        second,
        third,
        fourth,
        { step: 5, key: 'USAGE', status: 'NOT_AVAILABLE', reasons: ['NOT_BUILT_YET'] },
      ],
    };
  }
}
