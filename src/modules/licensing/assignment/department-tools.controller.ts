import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
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
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LICENSING_ERROR_EXAMPLES, toLicensingApiException } from '../mappers/licensing.http-errors';
import { DepartmentToolsService } from './department-tools.service';

class DepartmentToolsParamDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}
class DepartmentToolsQueryDto extends createZodDto(
  z.strictObject({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(50),
  }),
) {}
class DepartmentToolsResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      departmentId: z.uuid(),
      asOf: z.string(),
      summary: z.array(
        z.strictObject({
          applicationId: z.uuid(),
          applicationName: z.string(),
          planId: z.uuid(),
          planName: z.string(),
          seats: z.number().int().positive(),
        }),
      ),
      items: z.array(
        z.strictObject({
          assignmentId: z.uuid(),
          employeeCode: z.string(),
          fullName: z.string(),
          holderStatus: z.string(),
          kind: z.enum(['PERSONAL', 'SERVICE']),
          source: z.enum(['BASELINE', 'HANDOVER', 'REQUEST']),
          application: z.strictObject({ id: z.uuid(), name: z.string() }),
          plan: z.strictObject({ id: z.uuid(), name: z.string() }),
          effectiveFrom: z.string(),
          effectiveFromLabel: z.string().nullable(),
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

/**
 * The tools a department uses today (`US-03-06` AC-13, AC-17): read-only and aggregated from the seats of its people.
 * No route writes or edits the list.
 */
@ApiTags('departments')
@Controller({ path: 'departments', version: '1' })
export class DepartmentToolsController {
  constructor(private readonly tools: DepartmentToolsService) {}

  @Get(':id/tools-in-use')
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'departmentToolsInUse', summary: 'List the tools a department uses' })
  @ApiSuccessResponse(DepartmentToolsResponseDto, {
    message: 'DEPARTMENT_TOOLS.LISTED',
    description:
      'One page of what the department uses today: the personal seats its people hold and the service accounts the department owns (kind SERVICE, shown with the employee the account is assigned to), one line per seat with the tool and plan, oldest start first, then by assignment id. The summary counts the seats of every page by plan, sorted by application then plan name; pagination gives the total. A start that is only the day of recording has a label and no grant date.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Not an IT Admin, or a department head asking about a department that is not theirs (DEPARTMENT.OUT_OF_SCOPE).',
      examples: [FORBIDDEN_EXAMPLE, LICENSING_ERROR_EXAMPLES.DEPARTMENT_OUT_OF_SCOPE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The department does not exist (DEPARTMENT.NOT_FOUND).',
      examples: [LICENSING_ERROR_EXAMPLES.DEPARTMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async toolsInUse(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: DepartmentToolsParamDto,
    @Query() query: DepartmentToolsQueryDto,
  ) {
    try {
      const { asOf, summary, page } = await this.tools.toolsInUse(principal, params.id, query);

      return { departmentId: params.id, asOf, summary, items: page.items, pagination: page.pagination };
    } catch (error) {
      throw toLicensingApiException(error);
    }
  }
}
