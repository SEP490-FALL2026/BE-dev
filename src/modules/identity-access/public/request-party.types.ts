/** Why a person can never be a party of a Request (`D-S21`): the spending approver; the person with no department is added by the unplaced item. */
export type RequestPartyReason = 'SPENDING_APPROVER' | 'UNPLACED';

/** The side of the Request the person stands on: the one who asks or the one who is given access. */
export type RequestPartyRole = 'REQUESTER' | 'BENEFICIARY';

/** The people of a Request who are judged: the requester (null when nobody asks, as when IT Admin names a responsible person) and the beneficiaries. */
export interface RequestParties {
  requesterEmployeeId: string | null;
  beneficiaryEmployeeIds: readonly string[];
}

/** The refusal: the first side and reason that apply, with every person of the Request that has that same side and reason. */
export type RequestPartyBlock = {
  reason: RequestPartyReason;
  party: RequestPartyRole;
  employeeIds: string[];
};
