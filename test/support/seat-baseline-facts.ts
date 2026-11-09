import type { ExistingAssignment } from '../../src/modules/licensing/public/licensing.types';
import type { SeatCells } from '../../src/modules/data-import/seat-baseline-import/seat-baseline-import.types';
import {
  judgeSeatRows,
  type SeatFacts,
} from '../../src/modules/data-import/seat-baseline-import/seat-baseline-rows.policy';

export type { ExistingAssignment };

/** Fixtures of the seat baseline row judgement: a company with people of every kind, departments and their Units. */
export const TODAY = '2026-10-01';

/** Everyone started long before `TODAY`, so no row is early unless a test says so. */
const HIRED = '2020-01-01';
const DESIGN = { departmentId: 'd-des', costCenter: { id: 'cc-des', code: 'CC-DES', status: 'ACTIVE' } } as const;
const staff = {
  id: 'e-staff',
  status: 'ACTIVE',
  employmentType: 'STAFF',
  hireDate: HIRED,
  owningUnit: DESIGN,
} as const;
export const facts = (over: Partial<SeatFacts> = {}): SeatFacts => ({
  target: { kind: 'SUBSCRIPTION', purchasedQuantity: 100 },
  recordedOn: TODAY,
  employees: new Map([
    ['E1', { ...staff, id: 'e1' }],
    ['E2', { ...staff, id: 'e2' }],
    [
      'E6',
      {
        ...staff,
        id: 'e6',
        owningUnit: { departmentId: 'd-old', costCenter: { id: 'cc-old', code: 'CC-OLD', status: 'INACTIVE' } },
      },
    ],
    ['E7', { ...staff, id: 'e7', owningUnit: null }],
    ['E3', { ...staff, id: 'e3' }],
    ['E4', { ...staff, id: 'e4' }],
    ['E5', { ...staff, id: 'e5' }],
    ['LEFT', { id: 'e-left', status: 'TERMINATED', employmentType: 'STAFF', hireDate: HIRED }],
    ['T1', { id: 'e-intern', status: 'ACTIVE', employmentType: 'INTERN', hireDate: HIRED }],
    ['T2', { id: 'e-contractor', status: 'ACTIVE', employmentType: 'CONTRACTOR', hireDate: HIRED }],
    ['T3', { id: 'e-freelancer', status: 'ACTIVE', employmentType: 'FREELANCER', hireDate: HIRED }],
  ]),
  costCenters: new Map([
    ['CC-DES', { id: 'cc-des', kind: 'UNIT', status: 'ACTIVE' }],
    ['CC-OLD', { id: 'cc-old', kind: 'UNIT', status: 'INACTIVE' }],
    ['CC-A', { id: 'cc-a', kind: 'UNIT', status: 'ACTIVE' }],
  ]),
  companyDomains: ['congty.vn'],
  existing: [],
  ...over,
});
export const row = (lineNumber: number, cells: SeatCells) => ({ lineNumber, cells });
export const personal = (code: string, extra: SeatCells = {}) =>
  row(2, { employee_code: code, account_identifier: `${code.toLowerCase()}@congty.vn`, ...extra });
export const codesOf = (result: { errors: { code: string }[] }) => result.errors.map((error) => error.code);
export const judgeOne = (cells: SeatCells, over: Partial<SeatFacts> = {}) =>
  judgeSeatRows([row(2, cells)], facts(over))[0];
