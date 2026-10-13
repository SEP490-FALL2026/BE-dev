import { AppRole } from './identity-access.types';

export interface EffectiveRoles {
  /** Roles granted to the account directly and still in force. */
  direct: AppRole[];
  /**
   * Roles inferred from data rather than granted: MANAGER from heading a department (needs the
   * department-head history, G2) and the spending approver from configuration (US-01-03). Empty
   * until those exist; this is the seam they plug into, not a claim that nobody holds them.
   */
  derived: string[];
  effective: string[];
}

export function resolveEffectiveRoles(direct: readonly AppRole[]): EffectiveRoles {
  const derived: string[] = [];
  const effective = [...new Set<string>([...direct, ...derived])].sort();

  return { direct: [...direct].sort(), derived, effective };
}
