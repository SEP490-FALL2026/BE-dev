/** The roles an account can hold; the same set as `identity-access`, restated here because a policy names them as data. */
export const POLICY_ROLES = ['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER'] as const;

export type PolicyRole = (typeof POLICY_ROLES)[number];
