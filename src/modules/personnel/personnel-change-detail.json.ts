import { z } from 'zod';
import { nullableJsonColumn } from '../../infrastructure/database/json-column';

/**
 * What an event of an offboarding case carries beyond its kind and dates (`accessBlockMode`, `assignmentIds`, `count` …): an object of JSON
 * values whose keys depend on the kind. Free-form on purpose, but always an object of JSON, so a list or a bare value is a fault.
 */
const schema = z.record(z.string(), z.json());

/** The detail an event is written with: JSON values only, so what is written is what is read. */
export type ChangeDetail = z.output<typeof schema>;

/** `offboarding_case_changes.detail`: NULL for an event with no detail. */
export const offboardingChangeDetailJson = nullableJsonColumn({
  table: 'offboarding_case_changes',
  column: 'detail',
  schema,
  encode: (detail) => detail,
});
