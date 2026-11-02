import type { BusinessDate } from '../../../core/business-date';

/**
 * The reference to an HR document that a `/projects` write still cites until `qd93-remove-department-projects` removes it (no
 * employee or department write takes one since `QĐ-93f`): what kind of
 * document, its number, who issued it and when. Only the reference is kept; the file itself is not (the number
 * is the proof the Super Admin cites, the original stays with HR).
 */
export interface HrBasis {
  type: string;
  reference: string;
  issuer: string;
  issuedOn: BusinessDate;
}
