import type { PolicyContent } from '../library/library.json';
import type { PolicyRole } from '../public/policies.types';

/** One policy of the fixed set with the text of its first version: what the installation writes so that every decision has a policy in force. */
export interface InitialPolicy {
  code: string;
  title: string;
  applicableRoles: PolicyRole[];
  content: PolicyContent;
}
