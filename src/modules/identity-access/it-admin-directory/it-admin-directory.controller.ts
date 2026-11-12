import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { ItAdminDirectoryQueryDto, ItAdminPageResponseDto } from './it-admin-directory.dto';
import { ItAdminQueryService } from './it-admin-query.service';

/** The IT Admins who work now, so that an application can be handed to one of them (`QĐ-111g`). */
@ApiTags('it-admins')
@Controller({ version: '1' })
export class ItAdminDirectoryController {
  constructor(private readonly directory: ItAdminQueryService) {}

  @Get('it-admins')
  @RequireRoles('IT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'itAdminList', summary: 'List the IT Admins who work now' })
  @ApiSuccessResponse(ItAdminPageResponseDto, {
    message: 'IT_ADMIN.LISTED',
    description:
      'One page of the employees who hold the IT Admin role on an account that can act, by employee code, optionally searched by code or name.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin or the Super Admin reads the list.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Query() query: ItAdminDirectoryQueryDto) {
    return this.directory.list(query);
  }
}
