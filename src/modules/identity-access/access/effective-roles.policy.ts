import { AppRole } from '../public/identity-access.types';

/** Facts about an account that make roles appear without a grant. Each is read afresh on every request. */
export interface DerivedRoleFacts {
  /** The employee heads a department today (US-01-02). */
  headsDepartment: boolean;
  /** The employee is the configured spending approver (US-01-03). */
  isSpendingApprover?: boolean;
}

export interface EffectiveRoles {
  /** Roles granted to the account directly and still in force. */
  direct: AppRole[];
  /**
   * Roles inferred from data rather than granted: MANAGER from heading a department today (US-01-02) and the
   * spending approver from configuration (US-01-03).
   */
  derived: string[];
  effective: string[];
}

export function resolveEffectiveRoles(
  direct: readonly AppRole[],
  facts: DerivedRoleFacts = { headsDepartment: false },
): EffectiveRoles {
  const derived: string[] = [];
  // FR-8.7: the Super Admin is never a department head, so never a MANAGER, whatever the data says.
  if (facts.headsDepartment && !direct.includes('SUPER_ADMIN')) derived.push('MANAGER');
  // US-01-03 AC-2: a Super Admin never holds an approval role, so the role never shows for one either.
  if (facts.isSpendingApprover && !direct.includes('SUPER_ADMIN')) derived.push('SPENDING_APPROVER');
  const effective = [...new Set<string>([...direct, ...derived])].sort();

  return { direct: [...direct].sort(), derived, effective };
}
