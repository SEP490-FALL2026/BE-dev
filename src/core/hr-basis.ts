import type { BusinessDate } from './business-date';

/**
 * The reference to the HR document an employee record is entered or changed on (`FR-2.1`, `QĐ-82i`): what kind of
 * document, its number, who issued it and when. Only the reference is kept; the file itself is not (the number
 * is the proof the Super Admin cites, the original stays with HR).
 */
export interface HrBasis {
  type: string;
  reference: string;
  issuer: string;
  issuedOn: BusinessDate;
}
