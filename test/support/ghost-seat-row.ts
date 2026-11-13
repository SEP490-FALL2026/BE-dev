/** One row of `ghost_seat_findings` as the suites of the wasted-seat rules read it. */
export interface GhostRow {
  id: string;
  group: string;
  state: string;
  close_reason: string | null;
  tier: string | null;
  subscription_id: string | null;
  assignment_id: string | null;
  seat_chain_id: string | null;
  employee_id: string | null;
  department_id: string | null;
  free_seats: number | null;
  counts_toward_vacant_cost: boolean | null;
  revocation_task_id: string | null;
  holder_left_on: string | null;
  superseded_by_id: string | null;
  evidence: Record<string, unknown>;
  decider_department_id: string | null;
  routed_at: string | null;
  decision_due_on: string | null;
  overdue_noticed_at: string | null;
  return_count: number;
  revocation_not_before: string | null;
  paused_at: string | null;
  pause_transfer_id: string | null;
}
