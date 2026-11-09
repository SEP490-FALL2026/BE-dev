import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * Reads the chain of assignments a right was carried through: a renewal carries a seat to the next assignment (`RENEWAL_CARRY`), a handover
 * to another person (`HANDOVER`), each pointing back at the one before by `predecessor_id`. Nothing here writes; the writer of
 * `license_assignments` is `AssignmentRepo`.
 */
@Injectable()
export class AssignmentChainRepo {
  /**
   * The request whose grant made the right this assignment continues: the request of the most recently completed grant task among the
   * assignment and its predecessors. Null for a right that no request made (the baseline, a role). It is what the money a request holds
   * for the right is found by, whichever assignment of the chain is ended.
   */
  async grantRequestOfChain(tx: DbTx, assignmentId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ request_id: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT "id", "predecessor_id" FROM "license_assignments" WHERE "id" = ${assignmentId}::uuid
        UNION
        SELECT a."id", a."predecessor_id" FROM "license_assignments" a JOIN chain c ON a."id" = c."predecessor_id"
      )
      SELECT t."request_id" AS request_id
        FROM "provisioning_tasks" t
       WHERE t."assignment_id" IN (SELECT "id" FROM chain)
         AND t."kind" = 'GRANT'
         AND t."status" = 'COMPLETED'
         AND t."request_id" IS NOT NULL
       ORDER BY t."completed_at" DESC NULLS LAST, t."id" DESC
       LIMIT 1`;

    return rows[0]?.request_id ?? null;
  }

  /**
   * The assignment and every one it continues (`predecessor_id`: a renewal, a handover), the given one first: the records a request to go
   * on using names (its renewal records), so the module of requests finds every request that holds money for the right.
   */
  async chainOf(tx: DbTx, assignmentId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT "id", "predecessor_id", 0 AS depth FROM "license_assignments" WHERE "id" = ${assignmentId}::uuid
        UNION
        SELECT a."id", a."predecessor_id", c.depth + 1 FROM "license_assignments" a JOIN chain c ON a."id" = c."predecessor_id"
      )
      SELECT "id"::text AS id FROM chain ORDER BY depth`;

    return rows.map((row) => row.id);
  }
}
