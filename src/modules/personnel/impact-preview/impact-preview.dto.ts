import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { OLD_RIGHTS_MAX } from '../transfer-grace/transfer-grace.dto';

/** The most rights, requests or entries one person has: the limit of the rights of one person (`API-LIST-DETAIL.1`); a person has no more requests or roles than rights. */
const PREVIEW_ARRAY_MAX = OLD_RIGHTS_MAX;

const rightToRevokeSchema = z.strictObject({
  assignmentId: z.uuid(),
  application: z.strictObject({ id: z.uuid(), name: z.string() }),
  plan: z.strictObject({ id: z.uuid(), name: z.string() }),
  provisioningType: z.string().meta({ description: 'K1 to K5: how the seat is taken away.' }),
  revocable: z
    .boolean()
    .meta({ description: 'A task can take the seat away; false for the kinds with no revocation yet.' }),
  dataLossOnRemoval: z.boolean(),
  revocationNote: z.string().nullable().meta({ description: 'The note of the plan on how the seat is taken away.' }),
  revocationUnderWay: z.boolean().meta({ description: 'A task of the queue already works on taking it away.' }),
});

const openRequestSchema = z.strictObject({
  requestId: z.uuid(),
  type: z.string(),
  state: z.string(),
  line: z.boolean().meta({ description: 'The request is for a group: only the line of this person ends.' }),
});

const commitmentSchema = z.strictObject({
  currency: z.string(),
  amountMinor: z.string().meta({ description: 'The smallest unit of the currency, as a string.' }),
});

/** What a departure or a transfer would do to a person, the same shape for both. */
const impactShape = {
  rightsToRevoke: z.array(rightToRevokeSchema).max(PREVIEW_ARRAY_MAX).meta({
    description:
      'The personal rights the system takes back: for a departure the seats the person holds, which the IT Admin takes away; for a transfer the rights of the old department that the grace ends with, the very ones the system then opens a revocation for (granted after the transfer takes effect, ended or without a revocation are not in it).',
  }),
  openRequestsToCancel: z.array(openRequestSchema).max(PREVIEW_ARRAY_MAX).meta({
    description:
      'The requests the system closes: all the open ones of a departure, the paid ones sent from the old department for a transfer.',
  }),
  provisioningInFlight: z.array(openRequestSchema).max(PREVIEW_ARRAY_MAX).meta({
    description:
      'The requests with a grant being carried out: not closed, the IT Admin in charge is told to check the vendor and close them.',
  }),
  commitmentToRelease: z.array(commitmentSchema).max(PREVIEW_ARRAY_MAX).meta({
    description:
      'What is held and not spent for the requests that are closed and goes back to the budget, one entry for each currency.',
  }),
  responsibilities: z
    .strictObject({
      subscriptions: z.number().int().nonnegative(),
      applications: z.number().int().nonnegative(),
    })
    .meta({ description: 'What an IT Admin who leaves answers for in the catalog; 0 and 0 for anyone else.' }),
  vendorAdminRoles: z.array(z.string()).max(PREVIEW_ARRAY_MAX).meta({
    description: 'The plans the person administers at the vendor, as `<application> / <plan> (OWNER|ADMIN)`.',
  }),
  headSuccessorRequired: z.boolean().meta({
    description: 'The person heads the department they leave: the record needs an employee named to follow them.',
  }),
};

const departurePreviewSchema = z.strictObject({
  ...impactShape,
  revocationDueOn: responseBusinessDate.meta({
    description: 'The day the IT Admin has until to take every right away.',
  }),
});

const transferPreviewSchema = z.strictObject({
  ...impactShape,
  graceEndsOn: responseBusinessDate.meta({
    description: 'The last day the person keeps the rights of the old department.',
  }),
  graceReminderOn: responseBusinessDate.meta({
    description: 'The day the person is told once more that the rights are about to be taken back.',
  }),
});

export class DeparturePreviewResponseDto extends createZodDto(successEnvelopeSchema(departurePreviewSchema)) {}
export class TransferPreviewResponseDto extends createZodDto(successEnvelopeSchema(transferPreviewSchema)) {}
