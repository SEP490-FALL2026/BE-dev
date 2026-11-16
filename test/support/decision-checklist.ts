import request from 'supertest';
import type { ChecklistBody, DecisionStepCode } from '../../src/modules/policies/public/policy-checklist.types';
import { DECISION_STEP_CODES } from '../../src/modules/policies/public/policy-checklist.types';

interface SqlLike {
  query<T = unknown>(statement: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

interface StepInForce {
  policyVersionId: string;
  items: { code: string; check: 'SYSTEM' | 'PERSON' }[];
}

/**
 * The checklist of a decision as a person answers it (`QĐ-111ap`): the version of the policy in force at each of the seven steps, read once from
 * the database of the suite after the installation wrote the eight policies. A suite that decides a step sends `yes('1.2')`, every question
 * answered Yes, or `answer('1.2', ['1.2-05'])` with a No at the questions named.
 */
export class DecisionChecklists {
  private readonly steps = new Map<string, StepInForce>();

  /** Reads the version in force and the questions of the person at each step. Call it once the policies exist, and again after a suite publishes a version. */
  async load(sql: SqlLike, organizationId: string): Promise<void> {
    const { rows } = await sql.query<{
      id: string;
      content: { steps: { code: string; checklist: StepInForce['items'] }[] };
    }>(
      `SELECT DISTINCT ON (v.policy_id) v.id, v.content
         FROM policy_versions v JOIN policies p ON p.id = v.policy_id
        WHERE p.organization_id = $1 AND v.version_number IS NOT NULL
        ORDER BY v.policy_id, v.version_number DESC`,
      [organizationId],
    );
    this.steps.clear();
    for (const row of rows) {
      for (const step of row.content.steps)
        this.steps.set(step.code, { policyVersionId: row.id, items: step.checklist });
    }
  }

  /** The codes of the questions the person answers at the step. */
  questionsOf(step: DecisionStepCode): string[] {
    return this.inForce(step)
      .items.filter((item) => item.check === 'PERSON')
      .map((item) => item.code);
  }

  /** Every question answered Yes. */
  yes(step: DecisionStepCode): ChecklistBody {
    return this.answer(step, []);
  }

  /** Every question answered Yes except the ones named, which are answered No. */
  answer(step: DecisionStepCode, no: readonly string[]): ChecklistBody {
    const inForce = this.inForce(step);

    return {
      policyVersionId: inForce.policyVersionId,
      answers: this.questionsOf(step).map((itemCode) => ({ itemCode, answer: no.includes(itemCode) ? 'NO' : 'YES' })),
    };
  }

  /** The body with the checklist all Yes at the step, unless the suite gave its own. */
  withYes<T extends object>(step: DecisionStepCode, body: T): T & { checklist: ChecklistBody } {
    return { checklist: this.yes(step), ...body };
  }

  private inForce(step: DecisionStepCode): StepInForce {
    const found = this.steps.get(step);
    if (!found) throw new Error(`The policy with the step ${step} is not loaded: call load() after the installation.`);

    return found;
  }
}

/** The steps, for a suite that goes through them. */
export const CHECKLIST_STEPS = DECISION_STEP_CODES;

/** What a harness gives to post a decision with the checklist of its step (`server`, the headers of an account, the checklists read). */
export interface DecisionPoster {
  server(): Parameters<typeof request>[0];
  as(account: never): Record<string, string>;
  checklists: DecisionChecklists;
}

/** Posts a decision to its route with the checklist all Yes at the step, unless the body brings its own. */
export const postDecision = (
  poster: DecisionPoster,
  path: string,
  account: unknown,
  step: DecisionStepCode,
  body: object,
) =>
  request(poster.server())
    .post(path)
    .set(poster.as(account as never))
    .send(poster.checklists.withYes(step, body));
