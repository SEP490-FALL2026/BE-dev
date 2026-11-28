import { ProvisioningEvidenceFileInvalidError } from '../provisioning.errors';
export const EVIDENCE_FILES_MAX = 3;
export function assertEvidenceFileList(ids: readonly string[] | undefined): string[] {
  if (!ids) return [];
  if (ids.length > EVIDENCE_FILES_MAX) throw new ProvisioningEvidenceFileInvalidError('TOO_MANY');
  if (new Set(ids).size !== ids.length) throw new ProvisioningEvidenceFileInvalidError('DUPLICATE');
  return [...ids].sort();
}
