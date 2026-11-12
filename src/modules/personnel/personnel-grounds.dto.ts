import { z } from 'zod';
import { GROUNDS_TYPES } from './public/personnel.types';
import { businessDay } from '../../infrastructure/http/dto/business-date.dto';

/**
 * The basis an event of a person rests on, in the one shape every personnel operation takes (`BM-04`, `QĐ-77a`): the kind of document
 * is one of a closed list, and the number or file, the issuer and the day are given whole. A basis that is missing or lacks a part is
 * refused as a malformed body (`VALIDATION_ERROR`); that the number is only the code of a notice (`BM-09`) is the domain's to refuse.
 * What is read back stays a free `type`: the departures and transfers written before the list kept the words they were given.
 */
export const groundsBodySchema = z.strictObject({
  type: z.enum(GROUNDS_TYPES),
  reference: z.string().trim().min(1).max(200),
  issuer: z.string().trim().min(1).max(200),
  issuedOn: businessDay,
});

/**
 * The basis in one box (`QĐ-110a`, `QĐ-111bd`): a sentence naming the document ("QĐ nghỉ việc số 12/2026"), 1 to 500 characters once
 * trimmed. `groundsBodySchema` stays for the notice of a department head (`BM-09`), which keeps its four parts.
 */
export const groundsNoteBodySchema = z.string().trim().min(1).max(500);

/** The same basis where it is only needed in some cases (a return on another day than the approved one). */
export const optionalGroundsBodySchema = groundsBodySchema.optional();
