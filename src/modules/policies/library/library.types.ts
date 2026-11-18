import type { PolicyRole } from '../public/policies.types';
import type { PolicyContent } from './library.json';

/** A version of a policy as the library keeps it: the draft has no number, no time and no ground. */
export interface PolicyVersionRecord {
  id: string;
  policyId: string;
  policyCode: string;
  versionNumber: number | null;
  title: string;
  content: PolicyContent;
  applicableRoles: PolicyRole[];
  changeNote: string | null;
  requiresReacknowledgement: boolean;
  publishedByAppUserId: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

/** A published version: the number, the time and the ground are there. */
export interface PublishedVersionRecord extends PolicyVersionRecord {
  versionNumber: number;
  changeNote: string;
  publishedAt: Date;
}

/** One policy with the version in force (null until the first is published) and whether a draft is open. */
export interface PolicyRecord {
  id: string;
  code: string;
  current: PublishedVersionRecord | null;
  hasDraft: boolean;
}

/** What a version says of itself for the numbers the acknowledgement of everyone is judged by. */
export interface VersionFacts {
  policyId: string;
  versionNumber: number;
  requiresReacknowledgement: boolean;
}

export interface DraftValues {
  title: string;
  content: PolicyContent;
  applicableRoles: PolicyRole[];
}

export interface PublishValues {
  versionNumber: number;
  changeNote: string;
  applicableRoles: PolicyRole[];
  requiresReacknowledgement: boolean;
  publishedByAppUserId: string;
  publishedAt: Date;
}
