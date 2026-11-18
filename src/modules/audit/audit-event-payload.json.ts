import { z } from 'zod';
import { nullableJsonColumn } from '../../infrastructure/database/json-column';

/**
 * What the Audit Trail keeps of a record before and after a change: an allow-listed object of JSON values chosen by the module that
 * owns the data (`AuditEventInput`), never a list or a bare value. Free-form on purpose, so the keys are not listed here.
 */
const schema = z.record(z.string(), z.json());

/** `audit_events.before`: NULL for an event that changed nothing that existed. */
export const auditEventBeforeJson = nullableJsonColumn({
  table: 'audit_events',
  column: 'before',
  schema,
  encode: (snapshot) => snapshot,
});

/** `audit_events.after`: NULL for an event that left nothing behind. */
export const auditEventAfterJson = nullableJsonColumn({
  table: 'audit_events',
  column: 'after',
  schema,
  encode: (snapshot) => snapshot,
});
