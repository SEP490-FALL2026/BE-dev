import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { DATE_FORMATS, EVENT_CLASS_MAPPINGS, type SourceTemplate } from './vendor-source.types';

const columnName = z.string().trim().min(1).max(120);
/** A name of a type of event; never a name every object has, which would read as something the template inherited. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
const eventType = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (name) => !RESERVED_KEYS.has(name.toLowerCase()),
    'eventClasses may not name __proto__, constructor or prototype',
  );

/** The shape of a template as the IT Admin sends it and as it is kept. `eventClasses` has no entry when the report is aggregated. */
export const sourceTemplateSchema = z.strictObject({
  columns: z.strictObject({
    identifier: columnName,
    activeDates: columnName.optional(),
    lastActivityDate: columnName.optional(),
    date: columnName.optional(),
    eventType: columnName.optional(),
  }),
  eventClasses: z.record(eventType, z.enum(EVENT_CLASS_MAPPINGS)).default({}),
  dateFormat: z.enum(DATE_FORMATS).optional(),
}) satisfies z.ZodType<SourceTemplate, unknown>;

/** `usage_sources.template`. */
export const usageSourceTemplateJson = jsonColumn({
  table: 'usage_sources',
  column: 'template',
  schema: sourceTemplateSchema,
  encode: (template) => template,
});
