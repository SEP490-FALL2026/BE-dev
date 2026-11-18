import type { PolicyRole } from '../public/policies.types';
import type { PolicyContent } from './library.json';
import type { DraftValues } from './library.types';

/** What a write to the draft gives: each field that is given replaces the same field of the base, the others are kept. */
export interface DraftChange {
  title?: string;
  content?: PolicyContent;
}

/** The values of the draft after a write: the base (the open draft, else the version in force) with what the write gave over it. */
export function draftValuesOf(base: DraftValues, change: DraftChange): DraftValues {
  return {
    title: change.title ?? base.title,
    content: change.content ?? base.content,
    applicableRoles: base.applicableRoles,
  };
}

export interface PublishInput {
  changeNote: string;
  applicableRoles: PolicyRole[];
  requiresReacknowledgement: boolean;
}

/**
 * What publishing the draft writes onto it: the number after the last published one, and whether readers are asked again. The first
 * version always asks (`R-34`): nobody has acknowledged anything before it.
 */
export function publishValuesOf(lastNumber: number, input: PublishInput): PublishInput & { versionNumber: number } {
  const versionNumber = lastNumber + 1;

  return {
    versionNumber,
    changeNote: input.changeNote,
    applicableRoles: input.applicableRoles,
    requiresReacknowledgement: versionNumber === 1 ? true : input.requiresReacknowledgement,
  };
}
