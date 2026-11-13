import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DepartmentSoftwareChangesService } from '../department-tools/department-software-changes.service';
import type {
  DepartmentSoftwareEntryResult,
  DepartmentSoftwareFromCatalogLink,
} from './licensing-department-tools.types';

/**
 * The licensing facade for the list of software of a department, for a module that links a request to the catalog and lets the IT Admin put
 * the software in the list of the department at the same time (`QĐ-111c`; `requests` for SPEC FE IN-1). It is a facade of its own because
 * `LicensingApi` already has eight dependencies. The list only guides; nothing it holds grants anything.
 */
@Injectable()
export class LicensingDepartmentToolsApi {
  constructor(private readonly changes: DepartmentSoftwareChangesService) {}

  /**
   * Puts the application, alone or with its plan, in the list of the department, in the transaction of the caller: it is written once, a place
   * already listed is answered with its entry and `added: false` (and does not abort the transaction), and the Audit Trail records an entry that
   * was written. The caller has authorized the IT Admin on the request this department is of. Throws DepartmentSoftwareNotInCatalogError for
   * what the catalog does not offer (an application that is retired or not there, a plan of another application) and ToolsDepartmentNotFoundError.
   */
  addDepartmentSoftwareFromCatalogLink(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    link: DepartmentSoftwareFromCatalogLink,
  ): Promise<DepartmentSoftwareEntryResult> {
    return this.changes.addFromCatalogLink(tx, actor, {
      departmentId: link.departmentId,
      applicationId: link.applicationId,
      planId: link.planId,
      note: link.note ?? null,
    });
  }
}
