import { z } from 'zod';
import { UsageImportFileError } from '../vendor-import.errors';
import { MAX_REPORT_ROWS, REPORT_SCHEMA } from '../vendor-import.types';
import type { RawReport, RawReportRow } from './vendor-import-parse.types';

const NOT_A_PERSON_STATUSES = ['NOT_A_PERSON', 'CONCEALED', 'BOT'] as const;

const subjectSchema = z.strictObject({
  externalId: z.string(),
  identity: z.strictObject({ status: z.string().optional() }).optional(),
  activity: z
    .strictObject({
      activeDates: z.array(z.string()).optional(),
      lastActivityDate: z.string().nullable().optional(),
      events: z.array(z.strictObject({ date: z.string(), eventType: z.string() })).optional(),
    })
    .optional(),
});

const reportSchema = z.strictObject({
  schema: z.string(),
  source: z.strictObject({ application: z.string() }),
  window: z.strictObject({ start: z.string().nullable().optional(), end: z.string().nullable().optional() }).optional(),
  subjects: z.array(subjectSchema),
});

/**
 * Reads a JSON report of the normalized schema (`saas-sentry.vendor-usage-report/0.1-proposal`): which application it is of, the window
 * it declares and one subject for each identifier, with the days it was active, its last activity or its events. A subject the vendor
 * hides or marks as a bot is not a person. Throws UsageImportFileError: the schema the system does not read, a key it does not know,
 * too many pairs.
 */
export function readJsonReport(text: string): RawReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageImportFileError('FILE_UNREADABLE', { reason: 'NOT_JSON' });
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as { schema?: unknown }).schema !== REPORT_SCHEMA) {
    throw new UsageImportFileError('SCHEMA_UNSUPPORTED', { supported: REPORT_SCHEMA });
  }
  const checked = reportSchema.safeParse(parsed);
  if (!checked.success) {
    // Only where it went wrong, never the value: the identifier may be a secret.
    const path = checked.error.issues[0]?.path.join('.') ?? '';
    throw new UsageImportFileError('REPORT_INVALID', { path });
  }

  let pairs = 0;
  const rows: RawReportRow[] = checked.data.subjects.map((subject, position) => {
    const activeDates = subject.activity?.activeDates ?? [];
    const events = subject.activity?.events ?? [];
    const last = subject.activity?.lastActivityDate ?? null;
    pairs += Math.max(1, activeDates.length + events.length + (last ? 1 : 0));

    return {
      lineNumber: position + 1,
      identifier: subject.externalId.trim(),
      notAPerson: NOT_A_PERSON_STATUSES.some((status) => status === subject.identity?.status),
      activeDates,
      lastActivityDate: last,
      events,
    };
  });
  if (pairs > MAX_REPORT_ROWS) throw new UsageImportFileError('FILE_TOO_MANY_ROWS', { maxRows: MAX_REPORT_ROWS });

  const window = checked.data.window;

  return {
    rows,
    application: checked.data.source.application.trim(),
    window: window ? { from: window.start ?? null, to: window.end ?? null } : null,
    pairs,
  };
}
