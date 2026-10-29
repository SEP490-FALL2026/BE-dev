/** One seat the baseline wrote on a subscription another department owns, with the department that owns it. */
export interface SeatBaselineClosedSeat {
  assignmentId: string;
  /** The department that owns the subscription the seat sits on. */
  owningDepartmentId: string;
}

/** A person who holds seats on subscriptions of other departments than their own on the day step 4 is closed, with those seats. */
export interface SeatBaselineClosedHolder {
  employeeId: string;
  /** The department the person is in on the closing day (the head of this department decides the review, `QĐ-89e`). */
  employeeDepartmentId: string;
  /** Sorted by assignment id. */
  assignments: SeatBaselineClosedSeat[];
}
