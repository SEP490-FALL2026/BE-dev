import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';

/**
 * The date a request carries: a calendar date as `YYYY-MM-DD` that exists (`2026-02-30` is refused), judged exactly as `isBusinessDate`
 * does, with no trim and no coercion. The one definition every DTO uses, so what the document says about a date is said once: it carries
 * `format: 'date'` and a description beside the rule, which the schema of the runtime already enforces.
 *
 * The message is only the text of the issue (the wire carries the issue `code` and `path`); the few DTOs whose message names the field
 * pass their own, so the issue each one answers is the same as before this schema existed.
 */
export const BUSINESS_DATE_MESSAGE = 'Must be a real date as YYYY-MM-DD.';

const BUSINESS_DATE_DESCRIPTION = 'A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused).';

export const businessDateSchema = (
  message: string = BUSINESS_DATE_MESSAGE,
  description: string = BUSINESS_DATE_DESCRIPTION,
) => z.string().refine(isBusinessDate, { message }).meta({ format: 'date', description });

/**
 * A date a response states, with the same rule (a response is validated by it too) and `format: date`, worded for the reader of the
 * answer: the description of a request tells the sender what is refused, which a response never does.
 */
export const responseBusinessDate = businessDateSchema(BUSINESS_DATE_MESSAGE, 'A calendar date as YYYY-MM-DD.');

/** A date of a request, with the common message. */
export const businessDate = businessDateSchema();

/** The day of a personnel event (a transfer, a leave, a departure, a notice), with the message of those routes. */
export const businessDay = businessDateSchema('The day must be a real date as YYYY-MM-DD.');
