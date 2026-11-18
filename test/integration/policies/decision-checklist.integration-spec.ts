import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { PolicyChecklistApi } from '../../../src/modules/policies/public/policy-checklist.api';
import {
  PolicyChecklistHasNoError,
  PolicyChecklistIncompleteError,
  PolicyVersionChangedError,
} from '../../../src/modules/policies/public/policy-checklist.errors';
import type { ChecklistBody } from '../../../src/modules/policies/public/policy-checklist.types';
import { AccountManagementHttpHarness } from '../../support/account-management-http-harness';

const h = new AccountManagementHttpHarness();

/**
 * The checklist of a decision against real PostgreSQL (`PL-2.1`, QĐ-111ap): the questions come from the version of the policy in force, a newer
 * version turns an old checklist away, and the answers are kept once for each thing decided, never changed.
 */
describe('decision checklists (integration, real PostgreSQL)', () => {
  const api = () => h.ctx.app.get(PolicyChecklistApi, { strict: false });
  const run = <T>(work: Parameters<TransactionRunner['run']>[0]) =>
    h.ctx.app.get(TransactionRunner).run(work) as Promise<T>;
  const organizationId = () => h.seed.organizationId;
  const actor = randomUUID();

  /** The version in force of the policy of the flow and the questions the person answers at step 1.2. */
  const need = async () => {
    const row = (
      await h.ctx.sql.query<{
        id: string;
        n: number;
        content: { steps: { code: string; checklist: { code: string; check: string }[] }[] };
      }>(
        `SELECT v.id, v.version_number AS n, v.content FROM policy_versions v JOIN policies p ON p.id = v.policy_id
          WHERE p.organization_id = $1 AND p.code = 'POL-MF1' AND v.version_number IS NOT NULL ORDER BY v.version_number DESC LIMIT 1`,
        [organizationId()],
      )
    ).rows[0];
    const person = row.content.steps
      .find((step) => step.code === '1.2')!
      .checklist.filter((item) => item.check === 'PERSON');

    return { versionId: row.id, versionNumber: row.n, person: person.map((item) => item.code) };
  };
  const body = (versionId: string, codes: string[], no: string[] = []): ChecklistBody => ({
    policyVersionId: versionId,
    answers: codes.map((itemCode) => ({ itemCode, answer: no.includes(itemCode) ? 'NO' : 'YES' })),
  });
  const rowsOf = (subjectId: string) =>
    h.ctx.sql.query<{
      answers: unknown;
      has_no: boolean;
      decision: string;
      policy_version_id: string;
      line_employee_id: string | null;
    }>(
      'SELECT answers, has_no, decision, policy_version_id, line_employee_id FROM decision_checklists WHERE subject_id = $1',
      [subjectId],
    );

  beforeAll(async () => {
    await h.start();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('keeps the same answers once for each request of a batch, and fills the reason of a return from the question answered No', async () => {
    const { versionId, person } = await need();
    const subjects = [randomUUID(), randomUUID(), randomUUID()];

    await run(async (tx) => {
      const judged = await api().judge(tx, {
        organizationId: organizationId(),
        stepCode: '1.2',
        checklist: body(versionId, person, [person[1]]),
        decision: 'RETURN',
      });
      expect(judged.verdict.hasNo).toBe(true);
      expect(judged.reason).toContain(person[1]);
      await api().record(tx, {
        organizationId: organizationId(),
        verdict: judged.verdict,
        decision: 'RETURN',
        decidedByEmployeeId: actor,
        decidedAt: new Date(),
        subjects: subjects.map((id) => ({ kind: 'ACCESS_REQUEST' as const, id })),
      });
    });

    const [first, ...others] = await Promise.all(subjects.map((id) => rowsOf(id)));
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({ has_no: true, decision: 'RETURN', policy_version_id: versionId });
    for (const other of others) expect(other.rows[0].answers).toEqual(first.rows[0].answers);
    const answers = first.rows[0].answers as { itemCode: string; answer: string; check: string }[];
    expect(answers.find((answer) => answer.itemCode === person[1])?.answer).toBe('NO');
    expect(answers.some((answer) => answer.check === 'SYSTEM' && answer.answer === 'YES')).toBe(true);
  });

  it('keeps the answers of a person of a group with the person', async () => {
    const { versionId, person } = await need();
    const request = randomUUID();
    const line = randomUUID();

    await run(async (tx) => {
      const judged = await api().judge(tx, {
        organizationId: organizationId(),
        stepCode: '1.2',
        checklist: body(versionId, person),
        decision: 'APPROVE',
      });
      await api().record(tx, {
        organizationId: organizationId(),
        verdict: judged.verdict,
        decision: 'APPROVE',
        decidedByEmployeeId: actor,
        decidedAt: new Date(),
        subjects: [{ kind: 'ACCESS_REQUEST', id: request, lineEmployeeId: line }],
      });
    });

    expect((await rowsOf(request)).rows[0]).toMatchObject({
      line_employee_id: line,
      has_no: false,
      decision: 'APPROVE',
    });
  });

  it('locks the approval when an answer is No, and says the answers are not complete when one is missing', async () => {
    const { versionId, person } = await need();

    await expect(
      run((tx) =>
        api().judge(tx, {
          organizationId: organizationId(),
          stepCode: '1.2',
          checklist: body(versionId, person, [person[0]]),
          decision: 'APPROVE',
        }),
      ),
    ).rejects.toBeInstanceOf(PolicyChecklistHasNoError);
    await expect(
      run((tx) =>
        api().judge(tx, {
          organizationId: organizationId(),
          stepCode: '1.2',
          checklist: body(versionId, person.slice(1)),
          decision: 'APPROVE',
        }),
      ),
    ).rejects.toMatchObject({ constructor: PolicyChecklistIncompleteError, missing: [person[0]] });
  });

  it('turns away the checklist of a version the policy has left behind once the next is published', async () => {
    const { versionId, person } = await need();
    await h.admin.put('/api/v1/policies/POL-MF1/draft', {}).expect(200);
    await h.admin
      .post('/api/v1/policies/POL-MF1/draft/publish', {
        changeNote: 'Quyết định số 11',
        applicableRoles: ['MANAGER'],
        requiresReacknowledgement: false,
      })
      .expect(201);

    await expect(
      run((tx) =>
        api().judge(tx, {
          organizationId: organizationId(),
          stepCode: '1.2',
          checklist: body(versionId, person),
          decision: 'APPROVE',
        }),
      ),
    ).rejects.toMatchObject({ constructor: PolicyVersionChangedError, versionNumber: 2 });
    const now = await need();
    expect(now.versionId).not.toBe(versionId);
    const judged = await run<{ verdict: { policyVersionId: string; versionNumber: number } }>((tx) =>
      api().judge(tx, {
        organizationId: organizationId(),
        stepCode: '1.2',
        checklist: body(now.versionId, now.person),
        decision: 'APPROVE',
      }),
    );
    expect(judged.verdict).toMatchObject({ policyVersionId: now.versionId, versionNumber: 2 });
  });

  describe('the constraints and triggers', () => {
    const rejects = (statement: string, values: unknown[], message: RegExp) =>
      expect(h.ctx.sql.query(statement, values)).rejects.toThrow(message);

    it('never changes or deletes an answer, and never truncates the table', async () => {
      const id = randomUUID();
      const { versionId, person } = await need();
      await run(async (tx) => {
        const judged = await api().judge(tx, {
          organizationId: organizationId(),
          stepCode: '1.2',
          checklist: body(versionId, person),
          decision: 'APPROVE',
        });
        await api().record(tx, {
          organizationId: organizationId(),
          verdict: judged.verdict,
          decision: 'APPROVE',
          decidedByEmployeeId: actor,
          decidedAt: new Date(),
          subjects: [{ kind: 'ACCESS_REQUEST', id }],
        });
      });

      await rejects('UPDATE decision_checklists SET has_no = true WHERE subject_id = $1', [id], /append-only/);
      await rejects('DELETE FROM decision_checklists WHERE subject_id = $1', [id], /append-only/);
      await rejects('TRUNCATE decision_checklists', [], /append-only/);
    });

    it('refuses a decision that goes on with an answer No, a step that is not one of the seven and a line of a budget version', async () => {
      const { versionId } = await need();
      const insert = (columns: {
        step?: string;
        kind?: string;
        decision?: string;
        line?: string | null;
        hasNo?: boolean;
      }) =>
        h.ctx.sql.query(
          `INSERT INTO decision_checklists (id, organization_id, policy_version_id, step_code, subject_kind, subject_id, line_employee_id,
              decided_by_employee_id, decision, answers, has_no, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '[{"itemCode":"1.2-01","answer":"YES","check":"SYSTEM"}]'::jsonb, $10, now())`,
          [
            randomUUID(),
            organizationId(),
            versionId,
            columns.step ?? '1.2',
            columns.kind ?? 'ACCESS_REQUEST',
            randomUUID(),
            columns.line ?? null,
            actor,
            columns.decision ?? 'APPROVE',
            columns.hasNo ?? false,
          ],
        );

      await expect(insert({ decision: 'APPROVE', hasNo: false })).resolves.toBeDefined();
      await expect(insert({ decision: 'APPROVE', hasNo: true })).rejects.toThrow(/decision_checklists_no_check/);
      await expect(insert({ decision: 'KEEP', hasNo: true })).rejects.toThrow(/decision_checklists_no_check/);
      await expect(insert({ decision: 'RECLAIM', step: '5.4', hasNo: true })).resolves.toBeDefined();
      await expect(insert({ step: '2.1' })).rejects.toThrow(/decision_checklists_step_check/);
      await expect(insert({ kind: 'BUDGET_VERSION', line: randomUUID() })).rejects.toThrow(
        /decision_checklists_line_check/,
      );
    });

    it('has the checks that keep the record of a step sent back with its reason, and no decision of a person of a group that is returned', async () => {
      const constraints = await h.ctx.sql.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conname IN ('approval_records_return_reason_check', 'access_request_line_decisions_not_returned_check')`,
      );
      expect(constraints.rows.map((row) => row.conname).sort()).toEqual([
        'access_request_line_decisions_not_returned_check',
        'approval_records_return_reason_check',
      ]);
    });
  });
});
