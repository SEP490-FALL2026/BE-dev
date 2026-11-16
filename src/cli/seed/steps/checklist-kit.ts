import type { DemoRunContext } from '../demo-run.types';

export interface ChecklistBody {
  policyVersionId: string;
  answers: { itemCode: string; answer: 'YES' | 'NO' }[];
}

interface PolicyStep {
  policyVersionId: string;
  step: { checklist: { code: string; check: 'SYSTEM' | 'PERSON' }[] };
}

/**
 * The checklist of a decision step (`QĐ-111ap`, PL-2) as the person answers it in the demo: the version of the policy in force at that step
 * (`GET /policies/{code}/steps/{stepCode}`, read at each decision so a version published meanwhile is the one answered) and every question
 * of the person answered Yes. The policy of a step is the one of its main flow: `1.6` → `POL-MF1`, `4.7` → `POL-MF4`, `5.4` → `POL-MF5`.
 */
export async function yesChecklist(ctx: DemoRunContext, email: string, stepCode: string): Promise<ChecklistBody> {
  const policy = `POL-MF${stepCode.split('.')[0]}`;
  const read = await ctx.api.call<PolicyStep>(email, 'GET', `/policies/${policy}/steps/${stepCode}`);

  return {
    policyVersionId: read.policyVersionId,
    answers: read.step.checklist
      .filter((item) => item.check === 'PERSON')
      .map((item) => ({ itemCode: item.code, answer: 'YES' as const })),
  };
}
