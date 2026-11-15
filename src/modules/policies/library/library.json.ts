import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';

/** One question of a checklist. `SYSTEM` is answered by the system itself (shown as _Có_, never changed); `PERSON` by the person who decides. */
const itemSchema = z.strictObject({
  code: z.string().trim().min(1).max(30),
  text: z.string().trim().min(1).max(1000),
  check: z.enum(['SYSTEM', 'PERSON']),
});

/** A decision step of a main flow that has a checklist: its code in the flow description and the questions asked there. */
const stepSchema = z.strictObject({
  code: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(300),
  checklist: z.array(itemSchema).min(1).max(30),
});

const sectionSchema = z.strictObject({
  heading: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});

/**
 * What a version of a policy says: the sections to read and the steps whose decision asks a checklist. Step codes are unique in a
 * policy, and so are item codes: a decision names an item by its code alone.
 */
const schema = z
  .strictObject({
    sections: z.array(sectionSchema).max(30),
    steps: z.array(stepSchema).max(10),
  })
  .superRefine((content, context) => {
    const stepCodes = new Set<string>();
    const itemCodes = new Set<string>();
    content.steps.forEach((step, stepIndex) => {
      if (stepCodes.has(step.code)) {
        context.addIssue({ code: 'custom', path: ['steps', stepIndex, 'code'], message: 'step code repeats' });
      }
      stepCodes.add(step.code);
      step.checklist.forEach((item, itemIndex) => {
        if (itemCodes.has(item.code)) {
          context.addIssue({
            code: 'custom',
            path: ['steps', stepIndex, 'checklist', itemIndex, 'code'],
            message: 'item code repeats',
          });
        }
        itemCodes.add(item.code);
      });
    });
  });

export type PolicyContent = z.output<typeof schema>;
export type PolicyChecklistItem = PolicyContent['steps'][number]['checklist'][number];

/** `policy_versions.content`. */
export const policyContentJson = jsonColumn({
  table: 'policy_versions',
  column: 'content',
  schema,
  encode: (content) => content,
});

/** The schema of the same shape, for the body of the route that writes a draft. */
export const policyContentSchema = schema;
