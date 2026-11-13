/**
 * Where every Request of the shared demo v4 stands once a seed applied it in full (`src/cli/seed/fixture/shared-demo-v4/requests.ts`).
 * The fixture has no R09 nor R23; the draft of the department without a Cost Center is a step of its own (`requests.draft`).
 */
export const SHARED_DEMO_V4_REQUEST_STATES: Record<string, string> = {
  R01: 'COMPLETED',
  R02: 'AWAITING_SPEND_DECISION',
  R03: 'PENDING',
  R04: 'REJECTED',
  R05: 'WITHDRAWN',
  R06: 'AWAITING_EXECUTION',
  R07: 'AWAITING_SPEND_SUBMISSION',
  R08: 'AWAITING_IT_ASSESSMENT',
  R10: 'AWAITING_SPEND_DECISION',
  R11: 'AWAITING_SPEND_SUBMISSION',
  R12: 'AWAITING_SPEND_DECISION',
  R13: 'WAITING_CONTROLLED',
  R14: 'COMPLETED',
  R15: 'AWAITING_EXECUTION',
  R16: 'COMPLETED',
  R17: 'COMPLETED',
  R18: 'COMPLETED',
  R19: 'COMPLETED',
  R20: 'AWAITING_EXECUTION',
  R21: 'AWAITING_SPEND_SUBMISSION',
  R22: 'AWAITING_EXECUTION',
  R24: 'PENDING',
  R25: 'AWAITING_IT_ASSESSMENT',
  R26: 'AWAITING_SPEND_SUBMISSION',
};
