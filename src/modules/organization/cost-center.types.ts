export type CostCenterKind = 'UNIT' | 'COMPANY';
export type CostCenterStatus = 'ACTIVE' | 'INACTIVE';

/** A Cost Center as the catalogue shows it, with the department charged to it (a UNIT has at most one). */
export interface CostCenterRecord {
  id: string;
  code: string;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  department: { id: string; code: string; name: string } | null;
}
