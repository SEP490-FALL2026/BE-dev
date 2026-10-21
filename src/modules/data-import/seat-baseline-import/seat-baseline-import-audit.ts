import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput } from '../../audit/audit.types';
import type { SeatImportResult, SeatImportSummary } from './seat-baseline-import.types';

/**
 * The Audit Trail records of a seat baseline import, one builder per action (`US-02-05`). Each names the import and what
 * changed in counts only: never the cells, the identifiers or the codes of the file (only its file name and SHA-256).
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
    resourceType: 'SeatBaselineImport',
    resourceId: importId,
    before,
    after,
    correlationId: actor.sessionId,
  };
}

export function seatImportUploadedEvent(
  organizationId: string,
  actor: AuthenticatedPrincipal,
  importId: string,
  file: { fileName: string; contentHash: string; summary: SeatImportSummary },
): AuditEventInput {
  return importEvent(organizationId, actor, 'SEAT_BASELINE_IMPORT.UPLOADED', importId, null, {
    fileName: file.fileName,
    fileDigest: file.contentHash,
    planId: file.summary.target.planId,
    subscriptionId: file.summary.target.subscriptionId,
    rows: file.summary.totalRows,
    valid: file.summary.valid,
    errors: file.summary.errors,
  });
}

export function seatImportCancelledEvent(
  organizationId: string,
  actor: AuthenticatedPrincipal,
  importId: string,
): AuditEventInput {
  return importEvent(
    organizationId,
    actor,
    'SEAT_BASELINE_IMPORT.CANCELLED',
    importId,
    { status: 'PREVIEW' },
    { status: 'CANCELLED' },
  );
}

export function seatImportConfirmedEvent(
  organizationId: string,
  actor: AuthenticatedPrincipal,
  importId: string,
  confirmed: { previewVersion: number; result: SeatImportResult },
): AuditEventInput {
  return importEvent(
    organizationId,
    actor,
    'SEAT_BASELINE_IMPORT.CONFIRMED',
    importId,
    { status: 'PREVIEW', previewVersion: confirmed.previewVersion },
    { status: 'COMPLETED', source: 'BASELINE', created: confirmed.result.created, errors: confirmed.result.errors },
  );
}
