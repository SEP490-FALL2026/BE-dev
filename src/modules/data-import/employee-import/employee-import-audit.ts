import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { HrBasis } from '../../../core/hr-basis';
import type { AuditEventInput } from '../../audit/audit.types';
import type { ImportResult, ImportSummary } from './employee-import.types';

/**
 * The Audit Trail records of a people import, one builder per action (`US-02-01`). Each names the import and what
 * changed in counts only: never the cells, the names or the emails of the file (only its file name and SHA-256).
 */
function importEvent(
  organizationId: string,
  actor: AuthenticatedPrincipal,
  action: string,
  importId: string,
  before: AuditEventInput['before'],
  after: AuditEventInput['after'],
): AuditEventInput {
  return {
    organizationId,
    actorKind: 'USER',
    actorAppUserId: actor.appUserId,
    actorRoles: actor.roles,
    action,
    resourceType: 'EmployeeImport',
    resourceId: importId,
    before,
    after,
    correlationId: actor.sessionId,
  };
}

export function importUploadedEvent(
  organizationId: string,
  actor: AuthenticatedPrincipal,
  importId: string,
  file: { fileName: string; contentHash: string; summary: ImportSummary },
): AuditEventInput {
  return importEvent(organizationId, actor, 'EMPLOYEE_IMPORT.UPLOADED', importId, null, {
    fileName: file.fileName,
    fileDigest: file.contentHash,
    rows: file.summary.totalRows,
    valid: file.summary.valid,
    errors: file.summary.errors,
  });
}

export function importCancelledEvent(
  organizationId: string,
  actor: AuthenticatedPrincipal,
  importId: string,
): AuditEventInput {
  return importEvent(
    organizationId,
    actor,
    'EMPLOYEE_IMPORT.CANCELLED',
    importId,
    { status: 'PREVIEW' },
    { status: 'CANCELLED' },
  );
}

export function importConfirmedEvent(
  organizationId: string,
  actor: AuthenticatedPrincipal,
  importId: string,
  confirmed: { previewVersion: number; result: ImportResult; repeatedFile: boolean; hrBasis: HrBasis },
): AuditEventInput {
  return importEvent(
    organizationId,
    actor,
    'EMPLOYEE_IMPORT.CONFIRMED',
    importId,
    { status: 'PREVIEW', previewVersion: confirmed.previewVersion },
    {
      status: 'COMPLETED',
      created: confirmed.result.created,
      existingSame: confirmed.result.existingSame,
      existingDifferent: confirmed.result.existingDifferent,
      errors: confirmed.result.errors,
      repeatedFile: confirmed.repeatedFile,
      hrBasis: { ...confirmed.hrBasis },
    },
  );
}

/**
 * One new person of a confirmed import, with the HR basis the import was confirmed on (`US-02-02` AC-16). It carries the
 * code, the department and the title and nothing of the file's names or emails.
 */
export function importEmployeeCreatedEvent(
  organizationId: string,
  actor: AuthenticatedPrincipal,
  employeeId: string,
  created: { importId: string; employeeCode: string; department: string; jobTitle: string | null; hrBasis: HrBasis },
): AuditEventInput {
  return {
    organizationId,
    actorKind: 'USER',
    actorAppUserId: actor.appUserId,
    actorRoles: actor.roles,
    action: 'EMPLOYEE.CREATED',
    resourceType: 'Employee',
    resourceId: employeeId,
    before: null,
    after: {
      employeeCode: created.employeeCode,
      department: created.department,
      jobTitle: created.jobTitle,
      importId: created.importId,
      hrBasis: { ...created.hrBasis },
    },
    correlationId: actor.sessionId,
  };
}
