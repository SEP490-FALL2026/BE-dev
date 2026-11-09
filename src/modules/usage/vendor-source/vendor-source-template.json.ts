import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { EVENT_CLASS_MAPPINGS, type SourceTemplate } from './vendor-source.types';

const columnName = z.string().trim().min(1).max(120);

/** The shape of a template as the IT Admin sends it and as it is kept. `eventClasses` has no entry when the report is aggregated. */
export const sourceTemplateSchema = z.strictObject({
  columns: z.strictObject({
    identifier: columnName,
    activeDates: columnName.optional(),
    lastActivityDate: columnName.optional(),
    date: columnName.optional(),
    eventType: columnName.optional(),
  }),
  eventClasses: z.record(z.string().trim().min(1).max(120), z.enum(EVENT_CLASS_MAPPINGS)).default({}),
}) satisfies z.ZodType<SourceTemplate, unknown>;

/** `usage_sources.template`. */
export const usageSourceTemplateJson = jsonColumn({
  table: 'usage_sources',
  column: 'template',
  schema: sourceTemplateSchema,
  encode: (template) => template,
});
