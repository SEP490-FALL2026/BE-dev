import type { FunctionalGroupSystemKey } from './functional-group-standard.policy';

export type FunctionalGroupStatus = 'ACTIVE' | 'INACTIVE';

export interface FunctionalGroupRecord {
  id: string;
  name: string;
  status: FunctionalGroupStatus;
  /** `COMMUNICATION` or `OTHER` for the two fixed groups (`QĐ-111bf`), null for the rest. */
  systemKey: FunctionalGroupSystemKey | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FunctionalGroupListFilter {
  status?: FunctionalGroupStatus;
  skip: number;
  take: number;
}
