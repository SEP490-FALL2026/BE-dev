import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DepartmentSoftwareAccessService } from './department-software-access.service';
import type { SoftwareEntryWire, SoftwareProposalWire } from './department-software.dto';
import { DepartmentSoftwareRepo } from './department-software.repo';
import type { ProposalState } from './department-software.types';
import { DepartmentSoftwareViewService } from './department-software-view.service';

interface PageQuery {
  page: number;
  pageSize: number;
}

/**
 * The reads of the list of software of a department and of the proposals to add to it (`QĐ-110s`, `QĐ-110t`, SPEC P16 to P18). A page is one
 * query for the rows with their total and one read of the names, whatever its size. The list of a department is read by whoever the policy
 * admits (`DepartmentSoftwareAccessService`); the list of the caller's own department needs no id, so nobody asks for another's.
 */
@Injectable()
export class DepartmentSoftwareQueryService {
  constructor(
    private readonly repo: DepartmentSoftwareRepo,
    private readonly access: DepartmentSoftwareAccessService,
    private readonly view: DepartmentSoftwareViewService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Throws ToolsDepartmentNotFoundError and ToolsDepartmentOutOfScopeError. */
  async listOf(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    query: PageQuery,
  ): Promise<Page<SoftwareEntryWire>> {
    await this.access.assertMayRead(actor, departmentId);

    return this.entriesPage(departmentId, query);
  }

  /** The list of the department the caller is placed in today; an account placed nowhere gets an empty page and no department. */
  async listOfMine(
    actor: AuthenticatedPrincipal,
    query: PageQuery,
  ): Promise<{ departmentId: string | null; page: Page<SoftwareEntryWire> }> {
    const placement = await this.organizationReads.getEmployeePlacement(actor.employeeId);
    if (!placement) return { departmentId: null, page: pageOf([], 0, query.page, query.pageSize) };

    return { departmentId: placement.departmentId, page: await this.entriesPage(placement.departmentId, query) };
  }

  /**
   * The proposals the caller reads: an IT Admin those of the departments they are in charge of, a head those of the department they lead,
   * and both together for a person who is both. A department outside that scope gives an empty page, not a refusal.
   */
  async proposals(
    actor: AuthenticatedPrincipal,
    query: PageQuery & { departmentId?: string; state?: ProposalState },
  ): Promise<Page<SoftwareProposalWire>> {
    const scope = new Set(await this.access.itAdminScope(actor));
    const headed = actor.roles.includes('MANAGER') ? await this.access.headedDepartment(actor) : null;
    if (headed !== null) scope.add(headed);

    const { items, total } = await this.repo.pageProposals(
      { departmentIds: [...scope], departmentId: query.departmentId, state: query.state },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(await this.view.proposals(items), total, query.page, query.pageSize);
  }

  private async entriesPage(departmentId: string, query: PageQuery): Promise<Page<SoftwareEntryWire>> {
    const { items, total } = await this.repo.pageEntries(
      departmentId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(await this.view.entries(items), total, query.page, query.pageSize);
  }
}
