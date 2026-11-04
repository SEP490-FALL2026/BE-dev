import { randomUUID } from 'node:crypto';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();
const CHECK = '23514';
const FOREIGN_KEY = '23503';
const RESTRICT = '55000';

async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

async function sqlError(text: string, values: unknown[] = []): Promise<{ code: string; constraint?: string } | null> {
  try {
    await h.ctx.sql.query(text, values);
    return null;
  } catch (error) {
    const err = error as { code?: string; constraint?: string };
    return { code: err.code ?? 'unknown', constraint: err.constraint };
  }
}

describe('budget record attachments and history (integration, PostgreSQL constraints)', () => {
  let employeeId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const unit = await h.departmentWithHead('P-BAT');
    employeeId = unit.head.employeeId;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const freshCostCenter = async (): Promise<string> => (await h.departmentWithUnit(`P-BC${(counter += 1)}`)).unitId;

  const proposal = async (over: Record<string, unknown> = {}) => {
    const id = randomUUID();
    const row = {
      organization_id: h.seed.organizationId,
      cost_center_id: await freshCostCenter(),
      year: 2027,
      state: 'SUBMITTED',
      total_minor: 100,
      currency: 'VND',
      submitted_by_employee_id: employeeId,
      ...over,
    };
    const columns = Object.keys(row);
    await h.ctx.sql.query(
      `INSERT INTO budget_proposals (id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((column, index) => `$${index + 2}${column === 'state' ? '::"BudgetProposalState"' : ''}`).join(', ')})`,
      [id, ...columns.map((column) => (row as Record<string, unknown>)[column])],
    );

    return { id, costCenter: row.cost_center_id };
  };

  const version = async (over: Record<string, unknown> = {}) => {
    const source = await proposal();
    const id = randomUUID();
    const row = {
      organization_id: h.seed.organizationId,
      cost_center_id: source.costCenter,
      year: 2027,
      number: 1,
      kind: 'INITIAL',
      state: 'DRAFT',
      proposal_id: source.id,
      base_minor: 60,
      reserve_minor: 20,
      total_minor: 80,
      currency: 'VND',
      high_value_percent: 50,
      created_by_employee_id: employeeId,
      ...over,
    };
    const columns = Object.keys(row);
    await h.ctx.sql.query(
      `INSERT INTO budget_versions (id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((column, index) => `$${index + 2}${column === 'kind' ? '::"BudgetVersionKind"' : column === 'state' ? '::"BudgetVersionState"' : ''}`).join(', ')})`,
      [id, ...columns.map((column) => (row as Record<string, unknown>)[column])],
    );

    return { id, costCenter: row.cost_center_id };
  };

  describe('budget_version_history shape check (B1)', () => {
    it('accepts a history row of an attached and of a removed document and refuses each wrong shape', async () => {
      const v = await version();

      const insertHistory = (over: Record<string, unknown>) => {
        const row = {
          id: randomUUID(),
          organization_id: h.seed.organizationId,
          version_id: v.id,
          seq: (counter += 1),
          version_state: 'DRAFT',
          changed_by_employee_id: employeeId,
          ...over,
        };
        const columns = Object.keys(row);
        return sqlError(
          `INSERT INTO budget_version_history (${columns.join(', ')})
           VALUES (${columns.map((c, i) => `$${i + 1}${c === 'kind' ? '::"BudgetVersionHistoryKind"' : c === 'version_state' ? '::"BudgetVersionState"' : ''}`).join(', ')})`,
          columns.map((c) => (row as Record<string, unknown>)[c]),
        );
      };

      // Valid ATTACHMENT_ADDED
      const validAdded = await insertHistory({
        kind: 'ATTACHMENT_ADDED',
        before: null,
        after: JSON.stringify({
          attachmentId: randomUUID(),
          fileName: 'plan.pdf',
          contentType: 'application/pdf',
          sizeBytes: '100',
        }),
      });
      expect(validAdded).toBeNull();

      // Valid ATTACHMENT_REMOVED
      const validRemoved = await insertHistory({
        kind: 'ATTACHMENT_REMOVED',
        before: JSON.stringify({
          attachmentId: randomUUID(),
          fileName: 'plan.pdf',
          contentType: 'application/pdf',
          sizeBytes: '100',
          state: 'ATTACHED',
        }),
        after: JSON.stringify({ attachmentId: randomUUID(), fileName: 'plan.pdf', state: 'REMOVED' }),
      });
      expect(validRemoved).toBeNull();

      // Invalid ATTACHMENT_ADDED shapes
      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_ADDED',
            before: JSON.stringify({ foo: 'bar' }),
            after: JSON.stringify({ attachmentId: randomUUID() }),
          })
        )?.code,
      ).toBe(CHECK);

      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_ADDED',
            before: null,
            after: JSON.stringify(['not-an-object']),
          })
        )?.code,
      ).toBe(CHECK);

      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_ADDED',
            before: null,
            after: JSON.stringify({ attachmentId: randomUUID() }),
            position: 1,
          })
        )?.code,
      ).toBe(CHECK);

      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_ADDED',
            before: null,
            after: JSON.stringify({ attachmentId: randomUUID() }),
            from_position: 1,
          })
        )?.code,
      ).toBe(CHECK);

      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_ADDED',
            before: null,
            after: JSON.stringify({ attachmentId: randomUUID() }),
            to_position: 1,
          })
        )?.code,
      ).toBe(CHECK);

      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_ADDED',
            before: null,
            after: JSON.stringify({ attachmentId: randomUUID() }),
            line_count: 1,
          })
        )?.code,
      ).toBe(CHECK);

      // Invalid ATTACHMENT_REMOVED shapes
      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_REMOVED',
            before: null,
            after: JSON.stringify({ attachmentId: randomUUID() }),
          })
        )?.code,
      ).toBe(CHECK);

      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_REMOVED',
            before: JSON.stringify(['array']),
            after: JSON.stringify({ attachmentId: randomUUID() }),
          })
        )?.code,
      ).toBe(CHECK);

      expect(
        (
          await insertHistory({
            kind: 'ATTACHMENT_REMOVED',
            before: JSON.stringify({ foo: 'bar' }),
            after: JSON.stringify(['array']),
          })
        )?.code,
      ).toBe(CHECK);

      // Existing kinds still accepted
      expect(
        await insertHistory({
          kind: 'FIGURES_UPDATED',
          before: JSON.stringify({ base: '100' }),
          after: JSON.stringify({ base: '200' }),
        }),
      ).toBeNull();
    });
  });

  describe('budget_attachments table constraints and trigger', () => {
    const insertAttachment = (over: Record<string, unknown> = {}) => {
      const id = randomUUID();
      const row = {
        id,
        organization_id: h.seed.organizationId,
        target: 'PROPOSAL',
        status: 'AWAITING_UPLOAD',
        file_name: 'test.pdf',
        content_type: 'application/pdf',
        size_bytes: 1024,
        object_key: `pending-documents/2026/11/${(counter += 1)}-${id}`,
        uploaded_by_employee_id: employeeId,
        ...over,
      };
      const columns = Object.keys(row);
      return {
        id,
        execute: () =>
          sqlError(
            `INSERT INTO budget_attachments (${columns.join(', ')})
             VALUES (${columns.map((c, i) => `$${i + 1}${c === 'target' ? '::"BudgetAttachmentTarget"' : c === 'status' ? '::"BudgetAttachmentStatus"' : ''}`).join(', ')})`,
            columns.map((c) => (row as Record<string, unknown>)[c]),
          ),
      };
    };

    it('enforces budget_attachments_kept: rows cannot be deleted', async () => {
      const { id, execute } = insertAttachment();
      expect(await execute()).toBeNull();

      const del = await sqlError(`DELETE FROM budget_attachments WHERE id = $1`, [id]);
      expect(del?.code).toBe(RESTRICT);
      expect(del?.constraint).toBe('budget_attachments_kept');
    });

    it('enforces budget_attachments_born_awaiting: initial status must be AWAITING_UPLOAD without proposal or final key', async () => {
      const p = await proposal();
      const withStatus = insertAttachment({ status: 'ATTACHED' });
      const errStatus = await withStatus.execute();
      expect(errStatus?.code).toBe(RESTRICT);
      expect(errStatus?.constraint).toBe('budget_attachments_born_awaiting');

      const withProposal = insertAttachment({ proposal_id: p.id });
      const errProposal = await withProposal.execute();
      expect(errProposal?.code).toBe(RESTRICT);
      expect(errProposal?.constraint).toBe('budget_attachments_born_awaiting');

      const withFinal = insertAttachment({ final_object_key: `budget-documents/2026/11/final-${randomUUID()}` });
      const errFinal = await withFinal.execute();
      expect(errFinal?.code).toBe(RESTRICT);
      expect(errFinal?.constraint).toBe('budget_attachments_born_awaiting');
    });

    it('enforces budget_attachments_target_locked on insert of VERSION attachment', async () => {
      const vSent = await version({ state: 'SENT', sent_at: new Date(), sent_by_employee_id: employeeId });
      const att = insertAttachment({ target: 'VERSION', version_id: vSent.id });
      const err = await att.execute();
      expect(err?.code).toBe(RESTRICT);
      expect(err?.constraint).toBe('budget_attachments_target_locked');
    });

    it('enforces budget_attachments_declared: declared columns cannot change on update', async () => {
      const { id, execute } = insertAttachment();
      expect(await execute()).toBeNull();

      for (const col of [
        "file_name = 'other.pdf'",
        'size_bytes = 2048',
        "content_type = 'image/png'",
        "target = 'VERSION'",
      ]) {
        const err = await sqlError(`UPDATE budget_attachments SET ${col} WHERE id = $1`, [id]);
        expect(err?.code).toBe(RESTRICT);
        expect(err?.constraint).toBe('budget_attachments_declared');
      }
    });

    it('enforces budget_attachments_fixed: final_object_key and proposal_id are set once', async () => {
      const p1 = await proposal();
      const p2 = await proposal();
      const { id, execute } = insertAttachment();
      expect(await execute()).toBeNull();

      // Move to UPLOADED
      const finalKey1 = `budget-documents/2026/11/final-1-${id}`;
      expect(
        await sqlState(`UPDATE budget_attachments SET status = 'UPLOADED', final_object_key = $1 WHERE id = $2`, [
          finalKey1,
          id,
        ]),
      ).toBeNull();

      // Attempt to change final_object_key
      const errKey = await sqlError(`UPDATE budget_attachments SET final_object_key = 'changed-key' WHERE id = $1`, [
        id,
      ]);
      expect(errKey?.code).toBe(RESTRICT);
      expect(errKey?.constraint).toBe('budget_attachments_fixed');

      // Attach to proposal
      expect(
        await sqlState(
          `UPDATE budget_attachments SET status = 'ATTACHED', proposal_id = $1, attached_at = NOW() WHERE id = $2`,
          [p1.id, id],
        ),
      ).toBeNull();

      // Attempt to change proposal_id
      const errProp = await sqlError(`UPDATE budget_attachments SET proposal_id = $1 WHERE id = $2`, [p2.id, id]);
      expect(errProp?.code).toBe(RESTRICT);
      expect(errProp?.constraint).toBe('budget_attachments_fixed');
    });

    it('enforces budget_attachments_one_way: status transitions follow the lifecycle', async () => {
      const { id, execute } = insertAttachment();
      expect(await execute()).toBeNull();

      // Illegal transition from AWAITING_UPLOAD to REMOVED
      const err1 = await sqlError(`UPDATE budget_attachments SET status = 'REMOVED' WHERE id = $1`, [id]);
      expect(err1?.code).toBe(RESTRICT);
      expect(err1?.constraint).toBe('budget_attachments_one_way');

      // Quarantine is terminal
      expect(await sqlState(`UPDATE budget_attachments SET status = 'QUARANTINED' WHERE id = $1`, [id])).toBeNull();
      const errQuarantine = await sqlError(`UPDATE budget_attachments SET status = 'AWAITING_UPLOAD' WHERE id = $1`, [
        id,
      ]);
      expect(errQuarantine?.code).toBe(RESTRICT);
      expect(errQuarantine?.constraint).toBe('budget_attachments_one_way');
    });

    it('enforces check constraints: file_name, size_bytes, target invariants, and foreign keys', async () => {
      // Empty file name
      expect((await insertAttachment({ file_name: '   ' }).execute())?.code).toBe(CHECK);

      // Non-positive size_bytes
      expect((await insertAttachment({ size_bytes: 0 }).execute())?.code).toBe(CHECK);
      expect((await insertAttachment({ size_bytes: -5 }).execute())?.code).toBe(CHECK);

      // Foreign keys
      expect((await insertAttachment({ organization_id: randomUUID() }).execute())?.code).toBe(FOREIGN_KEY);
      const v = await version();
      expect((await insertAttachment({ target: 'VERSION', version_id: randomUUID() }).execute())?.code).toBe(
        FOREIGN_KEY,
      );
      expect(await insertAttachment({ target: 'VERSION', version_id: v.id }).execute()).toBeNull();
    });
  });
});
