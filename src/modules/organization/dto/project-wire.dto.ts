import { z } from 'zod';

/**
 * The project resource, shared by the project routes and the department profile, which embeds the same resource: one
 * definition for both (the schema twin of `mappers/project.mapper.ts`).
 */
export const projectSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['RUNNING', 'FINISHED']),
  departments: z.array(z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() })),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
