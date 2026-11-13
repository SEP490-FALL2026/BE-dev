import type { BusinessDate } from '../../../core/business-date';

/** A request sent in the grace of a transfer by the person it is for (SPEC P22, R5 E7): who, the day it was sent, and the day its grant was completed. */
export interface TransferGraceRequestFacts {
  requesterEmployeeId: string;
  submittedOn: BusinessDate;
  grantedOn: BusinessDate | null;
}
