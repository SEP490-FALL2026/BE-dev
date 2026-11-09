import type { CredentialRow } from './credential.repo';

export function toCredentialSummary(row: CredentialRow) {
  return {
    id: row.id,
    collectorKind: row.collectorKind,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastAcceptedAt: row.lastAcceptedAt ? row.lastAcceptedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revocationCause: row.revocationCause,
    revocationReason: row.revocationReason,
  };
}
