import { z } from 'zod';
import { MISSING_SOURCE_REASONS, SECTION_STATES } from './dashboard-section.policy';

/** One section of an overview on the wire: the same four fields in every overview, so a client reads every section one way. */
export const dashboardSectionSchema = z.strictObject({
  state: z.enum(SECTION_STATES).meta({
    description:
      'COUNTED: count is how many, in the scope of the caller. AT_SOURCE: the rows are listed by sourceOperationId in the same scope and are not counted here. NOT_AVAILABLE: the data has no source yet; reason says why. A section that is not counted is never shown as zero.',
  }),
  count: z.number().int().nonnegative().nullable().meta({ description: 'Set only when state is COUNTED.' }),
  sourceOperationId: z
    .string()
    .nullable()
    .meta({ description: 'The operation that lists the rows of the section; null when there is none yet.' }),
  reason: z
    .enum(MISSING_SOURCE_REASONS)
    .nullable()
    .meta({ description: 'Set only when state is NOT_AVAILABLE: the source of the data that is not delivered yet.' }),
});
