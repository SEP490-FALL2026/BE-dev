import type { z } from 'zod';
import { groupBodySchema } from '../group-request/group-request.dto';
import { submitBodySchema } from '../access-request/access-request.dto';
import type { DraftSaveBody } from './request-draft.dto';
import { draftPolicyJson, RETIRED_DRAFT_BODY_KEYS, type DraftPolicy } from '../request-draft/request-draft-policy.json';
import { beneficiaryCountOf } from '../request-draft/request-draft.policy';
import type { DraftRow } from '../request-draft/request-draft.repo';

/**
 * What a draft is sent from: the body of the operation that sends that kind of request, exactly as it was validated when the draft was
 * saved. It is kept in the `policy` column, which has no other use while the request is a draft: the table has no column for
 * the people of a group with the day each one's access ends, for the confirmation of a long term or for the day the money is expected to
 * go out, and a draft has no line and no price to keep them in.
 */
export type DraftContent =
  | { kind: 'INDIVIDUAL'; body: z.infer<typeof submitBodySchema> }
  | { kind: 'GROUP'; body: z.infer<typeof groupBodySchema> };

/** The JSON a draft keeps in `policy.draft`: the kind and the body, side by side. */
export function toContentJson(body: DraftSaveBody): DraftPolicy['draft'] {
  return { ...body };
}

/** What the draft was saved with, read again through the schema of the operation that sends it; a draft that does not parse is corrupt. */
export function contentOf(row: Pick<DraftRow, 'id' | 'policy'>): DraftContent {
  const { kind, ...body } = draftPolicyJson.decode(row.policy).draft;
  for (const key of RETIRED_DRAFT_BODY_KEYS) delete body[key];
  // The day a person's access ends is worked out by the system now; an older draft of a group may still carry one per line.
  if (Array.isArray(body.lines)) {
    for (const line of body.lines as Record<string, unknown>[]) delete line.expectedEndDate;
  }
  // A draft saved with a term in months keeps no term: the right has no end unless the draft is saved again with an end date (`QĐ-104a`).
  return parseContent(row.id, kind, body);
}

function parseContent(id: string, kind: string, body: Record<string, unknown>): DraftContent {
  switch (kind) {
    case 'INDIVIDUAL':
      return { kind, body: submitBodySchema.parse(body) };
    case 'GROUP':
      return { kind, body: groupBodySchema.parse(body) };
    default:
      throw new Error(`The draft ${id} is of the unknown kind ${kind}.`);
  }
}

/** How many people the draft is for. */
export function beneficiaryCountOfContent(content: DraftContent): number {
  return content.kind === 'GROUP'
    ? beneficiaryCountOf({ kind: 'GROUP', lines: content.body.lines })
    : beneficiaryCountOf({ kind: content.kind });
}

/** What the Audit Trail keeps of a draft that is deleted: ids, the kind and the count, never the reason or the people named. */
export function draftSnapshot(row: DraftRow, content: DraftContent): { [key: string]: string | number | null } {
  return {
    requestId: row.id,
    kind: content.kind,
    planId: row.planId,
    departmentId: row.departmentId,
    requesterEmployeeId: row.requesterEmployeeId,
    beneficiaryCount: beneficiaryCountOfContent(content),
  };
}
