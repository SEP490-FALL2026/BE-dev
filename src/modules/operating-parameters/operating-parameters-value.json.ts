import { z } from 'zod';
import { jsonColumn } from '../../infrastructure/database/json-column';
import type { ParameterValue } from './parameter-definitions.policy';

/**
 * The value of an operating parameter: a whole number, a word of a list, or a list of whole numbers. Which of the three a given key
 * takes, and within what range, is the definition of the key (`parameter-definitions.policy.ts`), judged when a value is set.
 */
const schema = z.union([z.number(), z.string(), z.array(z.number())]) satisfies z.ZodType<ParameterValue>;

/** `parameter_values.value`. */
export const operatingParameterValueJson = jsonColumn({
  table: 'parameter_values',
  column: 'value',
  schema,
  encode: (value) => value,
});
