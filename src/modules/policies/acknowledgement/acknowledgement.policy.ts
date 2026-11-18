import { POLICY_ROLES, type PolicyRole } from '../public/policies.types';

/** What the reader must know of one published version to judge whether an acknowledgement is still owed. */
export interface PublishedVersionFacts {
  versionNumber: number;
  requiresReacknowledgement: boolean;
}

export type MyAcknowledgement = 'PENDING' | 'DONE' | 'NOT_REQUIRED';

export interface AcknowledgementFacts {
  /** The roles the person holds (directly granted and in force). */
  roles: readonly PolicyRole[];
  /** The roles the version in force asks to acknowledge. */
  applicableRoles: readonly PolicyRole[];
  /** Every published version of the policy, in any order. */
  versions: readonly PublishedVersionFacts[];
  /** The numbers of the versions this person has acknowledged. */
  acknowledgedVersionNumbers: readonly number[];
}

/**
 * Whether the person owes the policy in force an acknowledgement (`QĐ-111bi`, R-34). The latest version that asks again (the first
 * version always does) is V*: a person of an applicable role who has acknowledged any version at or above V* is done; a version
 * published without the box ticked does not take back an acknowledgement given before it. A person with none of the applicable
 * roles owes nothing, and nothing is owed before the first version is published.
 */
export function acknowledgementStateOf(facts: AcknowledgementFacts): MyAcknowledgement {
  if (facts.versions.length === 0) return 'NOT_REQUIRED';
  if (!facts.roles.some((role) => facts.applicableRoles.includes(role))) return 'NOT_REQUIRED';
  const first = Math.min(...facts.versions.map((version) => version.versionNumber));
  const latestThatAsks = Math.max(
    ...facts.versions
      .filter((version) => version.requiresReacknowledgement || version.versionNumber === first)
      .map((version) => version.versionNumber),
  );

  return facts.acknowledgedVersionNumbers.some((number) => number >= latestThatAsks) ? 'DONE' : 'PENDING';
}

/** The roles a policy can name among the roles an account holds: whatever else a token carries is not a role of the library. */
export function policyRolesOf(roles: readonly string[]): PolicyRole[] {
  return POLICY_ROLES.filter((role) => roles.includes(role));
}
