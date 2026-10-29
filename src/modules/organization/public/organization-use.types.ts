// What keeps a department or a Cost Center in use, told by the modules that hold the fact (`QĐ-90e`, `QĐ-87d(2)`): what their
// readers (`organization.extension-points.ts`) answer and what the facade hands back. Public types of the organization, like
// `organization.types.ts`.

/**
 * One thing that keeps a department or a Cost Center in use: what kind it is, its id and a short label (a code or a name), never
 * a figure or the record of a person. The modules that hold the fact tell it; the organization only lists it (`QĐ-90e`, `QĐ-87d(2)`).
 */
export interface UseItem {
  kind: string;
  id: string;
  label: string | null;
}

/** The first of the things of one kind that keep it in use and how many there are in all. */
export interface UseGroup {
  items: UseItem[];
  total: number;
}

export type DepartmentUseGroupName = 'OPEN_WORK' | 'SUBSCRIPTIONS';
export type CostCenterUseGroupName = 'REQUESTS' | 'COMMITMENTS';

export interface DepartmentUse {
  openWork: UseGroup;
  subscriptions: UseGroup;
}

export interface CostCenterUse {
  requests: UseGroup;
  commitments: UseGroup;
}
