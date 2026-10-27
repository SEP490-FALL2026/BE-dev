import { DirectionRefusedError } from './cost-center-direction.errors';
import type { DirectionEnvironment } from './cost-center-direction.types';

/** A release reference or a basis is a short written reference, not prose and not data. */
const REFERENCE_MIN = 2;
const REFERENCE_MAX = 200;

const lengthOk = (value: string): boolean => value.length >= REFERENCE_MIN && value.length <= REFERENCE_MAX;

/**
 * The rules of the command that need no database, judged before the transaction (spec L.11): the evidence and the basis
 * are 2 to 200 characters, and in `SHARED` the person who runs the command is not the person who approved it.
 * `LOCAL_TEST` lets one person do both; the Audit Trail records the environment.
 */
export function assertDirectionRules(input: {
  environment: DirectionEnvironment;
  approvedBy: string;
  operator: string;
  releaseEvidence?: string;
  basis?: string;
}): void {
  if (input.releaseEvidence !== undefined && !lengthOk(input.releaseEvidence)) {
    throw new DirectionRefusedError('RELEASE_EVIDENCE_INVALID');
  }
  if (input.basis !== undefined && !lengthOk(input.basis)) throw new DirectionRefusedError('BASIS_INVALID');
  if (input.environment === 'SHARED' && input.approvedBy.trim().toLowerCase() === input.operator.trim().toLowerCase()) {
    throw new DirectionRefusedError('APPROVER_IS_OPERATOR');
  }
}
