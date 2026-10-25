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
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { ApplicationIdParamDto } from './application.dto';
import { APPLICATION_ERROR_EXAMPLES as EXAMPLES, toApplicationApiException } from './application.http-errors';
import { ApplicationOwnerService } from './application-owner.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const owner = z.strictObject({
  employeeId: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  status: z.enum(['ACTIVE', 'TERMINATED']),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
const warningsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

class OwnerWarningsQueryDto extends createZodDto(warningsQuerySchema) {}
class OwnerWarningPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(
        z.strictObject({
          applicationId: z.uuid(),
          applicationName: z.string(),
          kind: z.enum(['SAAS', 'LICENSED', 'INTERNAL']),
          businessOwner: owner,
        }),
      ),
      pagination,
    }),
  ),
) {}
class OwnerHistoryResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(
        z.strictObject({
          employee: owner,
          assignedAt: z.iso.datetime(),
          assignedBy: z.uuid().nullable(),
          endedAt: z.iso.datetime().nullable(),
        }),
      ),
      pagination,
    }),
  ),
) {}

/**
 * The Business Owners of the applications (`US-04-06`): the alert that an owner has left and the history of who the owner
 * was. The IT Admin reads the alert; naming a replacement is `PATCH /applications/{id}`. Finance may read the history.
 * The Business Owner is an attribute, never an account that is granted or revoked (`SoD-5`).
 */
@ApiTags('applications')
@Controller({ version: '1' })
export class ApplicationOwnersController {
  constructor(private readonly owners: ApplicationOwnerService) {}

  @Get('business-owner-warnings')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'businessOwnerWarningList',
    summary: 'List the applications whose Business Owner has left',
  })
  @ApiSuccessResponse(OwnerWarningPageResponseDto, {
    message: 'BUSINESS_OWNER_WARNING.LISTED',
    description:
      'A page of the applications, of every kind, whose Business Owner has left, by name. The application keeps that owner until a working one is named.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin reads the alerts.', examples: [FORBIDDEN_EXAMPLE] },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async warnings(@Query() query: OwnerWarningsQueryDto) {
    try {
      return await this.owners.warnings(query);
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }

  @Get('applications/:id/business-owners')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({
    operationId: 'applicationBusinessOwnerHistory',
    summary: 'List the Business Owners an application had',
  })
  @ApiSuccessResponse(OwnerHistoryResponseDto, {
    message: 'APPLICATION.BUSINESS_OWNERS_LISTED',
    description:
      'A page of the periods of the Business Owner, the latest first: the person, from when to when, and who made the change.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin and Finance read the history.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The application does not exist (APPLICATION.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not a UUID or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async history(@Param() params: ApplicationIdParamDto, @Query() query: OwnerWarningsQueryDto) {
    try {
      const page = await this.owners.history(params.id, query);

      return {
        items: page.items.map((period) => ({
          ...period,
          assignedAt: period.assignedAt.toISOString(),
          endedAt: period.endedAt ? period.endedAt.toISOString() : null,
        })),
        pagination: page.pagination,
      };
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }
}
