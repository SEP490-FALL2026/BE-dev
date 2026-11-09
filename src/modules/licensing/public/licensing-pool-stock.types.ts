/** What the shared pool of a plan holds today, as the queue of the IT Admin shows it: seats (K2), keys (K4) or nothing counted (the other kinds). */
export interface PlanStock {
  kind: 'SEATS' | 'KEYS' | 'NONE';
  /** Seats or keys bought and not held by a right in force today, counted over the subscriptions a grant can take them from. */
  free: number;
  /** Seats or keys held by a right whose revocation is still open: not free yet. */
  inRevocation: number;
}
