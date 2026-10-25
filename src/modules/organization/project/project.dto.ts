import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { projectSchema, projectSummarySchema } from '../dto/project-wire.dto';

export const createProjectBodySchema = z.strictObject({
  name: z.string().max(1000),
  description: z.string().max(5000).nullish(),
  status: z.enum(['RUNNING', 'FINISHED']).optional(),
  departmentIds: z.array(z.uuid()).max(100),
});

export const updateProjectBodySchema = z.strictObject({
  name: z.string().max(1000).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['RUNNING', 'FINISHED']).optional(),
  departmentIds: z.array(z.uuid()).max(100).optional(),
});

export const listProjectsQuerySchema = z.strictObject({
  departmentId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const projectIdParamSchema = z.strictObject({ id: z.uuid() });

export class CreateProjectBodyDto extends createZodDto(createProjectBodySchema) {}
export class UpdateProjectBodyDto extends createZodDto(updateProjectBodySchema) {}
export class ListProjectsQueryDto extends createZodDto(listProjectsQuerySchema) {}
export class ProjectIdParamDto extends createZodDto(projectIdParamSchema) {}
export class ProjectResponseDto extends createZodDto(successEnvelopeSchema(projectSchema)) {}
export class ProjectListResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(projectSummarySchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
