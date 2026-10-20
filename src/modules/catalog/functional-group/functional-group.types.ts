export type FunctionalGroupStatus = 'ACTIVE' | 'INACTIVE';

export interface FunctionalGroupRecord {
  id: string;
  name: string;
  status: FunctionalGroupStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface FunctionalGroupListFilter {
  status?: FunctionalGroupStatus;
  skip: number;
  take: number;
}
