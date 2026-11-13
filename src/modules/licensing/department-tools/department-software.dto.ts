import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { repeatedItem } from './department-software.policy';

/** At most this many places are added, and as many taken out, by one call (SPEC P16). */
export const SOFTWARE_LIST_CHANGES_MAX = 50;

const idParamSchema = z.strictObject({ id: z.uuid() });

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
};
const pageQuerySchema = z.strictObject(pageQuery);

const noteSchema = z.string().trim().min(1).max(500);

/** A place of the catalog the IT Admin adds: an application, alone or with one of its plans, and a note for the people who read the list. */
const placeToAddSchema = z.strictObject({
  applicationId: z.uuid(),
  planId: z.uuid().nullish(),
  note: noteSchema.nullish(),
});

/**
 * What the IT Admin in charge changes in the list, in one call: places to add (at most 50) and entries to take out (at most 50); the
 * removals are done first, so one call can replace a place with a new note. Empty, or the same place twice, is refused here; whether the
 * place is in the catalog and whether it is already listed is judged against the data.
 */
export const softwareListChangesBodySchema = z
  .strictObject({
    add: z.array(placeToAddSchema).max(SOFTWARE_LIST_CHANGES_MAX).optional(),
    remove: z.array(z.uuid()).max(SOFTWARE_LIST_CHANGES_MAX).optional(),
  })
  .superRefine((body, context) => {
    const add = body.add ?? [];
    const remove = body.remove ?? [];
    if (add.length === 0 && remove.length === 0) {
      context.addIssue({ code: 'custom', path: [], message: 'Give a place to add or an entry to take out.' });
    }
    if (repeatedItem(add.map((place) => ({ applicationId: place.applicationId, planId: place.planId ?? null })))) {
      context.addIssue({ code: 'custom', path: ['add'], message: 'The same place is given twice.' });
    }
    if (new Set(remove).size !== remove.length) {
      context.addIssue({ code: 'custom', path: ['remove'], message: 'The same entry is given twice.' });
    }
  });

const reasonSchema = z.string().trim().min(1).max(500);

/** The proposal of the head: a place of the catalog and why. The department is the one the head leads (SPEC P18). */
export const softwareProposalBodySchema = z.strictObject({
  applicationId: z.uuid(),
  planId: z.uuid().nullish(),
  reason: reasonSchema,
});

/** The rejection of a proposal: the reason is required (`QĐ-110t`). */
export const softwareProposalRejectionBodySchema = z.strictObject({ reason: reasonSchema });

export const softwareProposalListQuerySchema = z.strictObject({
  ...pageQuery,
  departmentId: z.uuid().optional(),
  state: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']).optional(),
});

export const softwareEntrySchema = z.strictObject({
  entryId: z.uuid(),
  applicationId: z.uuid(),
  applicationName: z.string(),
  planId: z.uuid().nullable(),
  planName: z.string().nullable(),
  note: z.string().nullable(),
  addedAt: z.string(),
});

const personSchema = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

export const softwareProposalSchema = z.strictObject({
  proposalId: z.uuid(),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  applicationId: z.uuid(),
  applicationName: z.string(),
  planId: z.uuid().nullable(),
  planName: z.string().nullable(),
  reason: z.string(),
  state: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
  proposedBy: personSchema,
  proposedAt: z.string(),
  decidedAt: z.string().nullable(),
  decisionReason: z.string().nullable(),
});

const paginationSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type SoftwareEntryWire = z.output<typeof softwareEntrySchema>;
export type SoftwareProposalWire = z.output<typeof softwareProposalSchema>;

export class DepartmentSoftwareIdParamDto extends createZodDto(idParamSchema) {}
export class DepartmentSoftwareQueryDto extends createZodDto(pageQuerySchema) {}
export class DepartmentSoftwareChangesBodyDto extends createZodDto(softwareListChangesBodySchema) {}
export class DepartmentSoftwareProposalBodyDto extends createZodDto(softwareProposalBodySchema) {}
export class DepartmentSoftwareRejectionBodyDto extends createZodDto(softwareProposalRejectionBodySchema) {}
export class DepartmentSoftwareProposalQueryDto extends createZodDto(softwareProposalListQuerySchema) {}

export class DepartmentSoftwareListResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({ departmentId: z.uuid(), items: z.array(softwareEntrySchema), pagination: paginationSchema }),
  ),
) {}
export class MyDepartmentSoftwareListResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      departmentId: z.uuid().nullable(),
      items: z.array(softwareEntrySchema),
      pagination: paginationSchema,
    }),
  ),
) {}
export class DepartmentSoftwareChangesResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      added: z.array(softwareEntrySchema).max(SOFTWARE_LIST_CHANGES_MAX),
      removed: z.array(z.uuid()).max(SOFTWARE_LIST_CHANGES_MAX),
    }),
  ),
) {}
export class DepartmentSoftwareProposalResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ proposal: softwareProposalSchema })),
) {}
export class DepartmentSoftwareAcceptanceResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ proposal: softwareProposalSchema, entryId: z.uuid() })),
) {}
export class DepartmentSoftwareProposalListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(softwareProposalSchema), pagination: paginationSchema })),
) {}
