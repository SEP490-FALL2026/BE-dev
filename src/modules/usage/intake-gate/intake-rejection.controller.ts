import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { USAGE_ERROR_EXAMPLES as EXAMPLES, toUsageApiException } from './intake-gate.http-errors';
import { IntakeRejectionQueryService } from './intake-rejection-query.service';

const REASONS = [
  'NOT_ACKNOWLEDGED',
  'COLLECTION_STOPPED',
  'TOOL_STATUS_NOT_ACKNOWLEDGED',
  'OUTSIDE_WINDOW',
  'NOT_IN_ALLOWLIST',
  'FUTURE_GENERATED_AT',
  'FUTURE_OBSERVED_AT',
  'INVALID_COVERAGE',
  'INVALID_QUOTA',
] as const;

const rejectionListQuerySchema = z.strictObject({
  reasonCode: z.enum(REASONS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

class DeviceIdParamDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}
class RejectionListQueryDto extends createZodDto(rejectionListQuerySchema) {}
class RejectionPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(
        z.strictObject({
          id: z.uuid(),
          endpoint: z.enum(['AI_USAGE_BATCH', 'AI_TOOL_STATUS_SNAPSHOT']),
          date: responseBusinessDate.nullable(),
          reasonCode: z.enum(REASONS),
          rejectedAt: z.iso.datetime(),
        }),
      ),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}

/** Why data from a machine was refused. */
@ApiTags('intake-rejections')
@Controller({ path: 'devices', version: '1' })
@RequireRoles('IT_ADMIN')
export class IntakeRejectionController {
  constructor(private readonly queries: IntakeRejectionQueryService) {}

  @Get(':id/intake-rejections')
  @ApiOperation({ operationId: 'deviceIntakeRejectionList', summary: 'List why data from a machine was refused' })
  @ApiSuccessResponse(RejectionPageResponseDto, {
    message: 'DEVICE_INTAKE_REJECTION.LISTED',
    description:
      'The refusals of a machine, newest first: the endpoint, the day when the refusal was about one, and the reason.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the refusals of a machine.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The machine is not in the register (DEVICE.NOT_FOUND).',
      examples: [EXAMPLES.DEVICE_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Param() params: DeviceIdParamDto, @Query() query: RejectionListQueryDto) {
    try {
      return await this.queries.ofDevice(params.id, query);
    } catch (error) {
      throw toUsageApiException(error);
    }
  }
}
