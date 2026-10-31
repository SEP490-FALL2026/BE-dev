import type { MyRequestSummaryWire } from './my-requests.dto';
import { canWithdrawOwn, outcomeOf, spendStageOf, waitingForOf } from './my-requests.policy';
import type { MyRequestRow, OutcomeFacts, SpendStageFacts } from './my-requests.types';

export interface EmployeeRef {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

/** What a row needs from the other contexts and the other tables, read once for the page. */
export interface MyRequestLookups {
  people: ReadonlyMap<string, EmployeeRef>;
  plans: ReadonlyMap<string, { planId: string; planName: string; applicationId: string; applicationName: string }>;
  softwareNames: ReadonlyMap<string, string>;
  facts: SpendStageFacts & OutcomeFacts;
}

/** A row of the list as the wire carries it: the dates written as text, the people named, the stage and the reason read from the facts. */
export function toSummary(
  row: MyRequestRow,
  requesterEmployeeId: string,
  lookups: MyRequestLookups,
): MyRequestSummaryWire {
  const person = (id: string | null): EmployeeRef | null => {
    if (id === null) return null;

    return lookups.people.get(id) ?? failMissing('employee', id, row.id);
  };
  const stage = spendStageOf(row, lookups.facts);
  const planId = row.planId;

  return {
    id: row.id,
    type: row.type,
    branch: row.branch,
    state: row.state,
    plan: planId === null ? null : (lookups.plans.get(planId) ?? failMissing('plan', planId, row.id)),
    softwareName: lookups.softwareNames.get(row.id) ?? null,
    beneficiary: person(row.beneficiaryEmployeeId),
    lineCount: row.lineCount,
    termMonths: row.termMonths,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    needStep: {
      state: row.needStep.state,
      assignee: person(waitingForOf(row.needStep)),
      waitingReason: row.needStep.waitingReason,
    },
    spend: stage === null ? null : { stage },
    outcome: outcomeOf(row, stage, lookups.facts),
    withdrawal: row.withdrawal && { withdrawnAt: row.withdrawal.withdrawnAt?.toISOString() ?? null },
    canWithdraw: canWithdrawOwn({ state: row.state, requesterEmployeeId }, stage),
  };
}

function failMissing(what: string, id: string, requestId: string): never {
  throw new Error(`The ${what} ${id} of the request ${requestId} does not exist.`);
}
