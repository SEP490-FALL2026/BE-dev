import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AppointUnplacedWorkDesignationBodyDto,
  AppointUnplacedWorkDesignationResponseDto,
  ListUnplacedWorkDesignationsQueryDto,
  UnplacedWorkDesignationIdParamDto,
  UnplacedWorkDesignationPageResponseDto,
  UnplacedWorkDesignationResponseDto,
} from './unplaced-work-designation.dto';
import {
  AUTH_ERRORS,
  READ_ROLES_ONLY,
  SUPER_ADMIN_ONLY,
  toUnplacedWorkDesignationApiException,
  UNPLACED_WORK_DESIGNATION_ERROR_EXAMPLES,
  VALIDATION_ERROR,
} from './unplaced-work-designation.http-errors';
import { toUnplacedWorkDesignationWire } from './unplaced-work-designation.mapper';
import { UnplacedWorkDesignationService } from './unplaced-work-designation.service';

@ApiTags('departments')
@Controller({ path: 'unplaced-work-designations', version: '1' })
export class UnplacedWorkDesignationController {
  constructor(private readonly designations: UnplacedWorkDesignationService) {}

  @Post()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'unplacedWorkDesignationAppoint',
    summary: 'Designate an IT Admin for specific works of a never-placed employee',
  })
  @ApiSuccessResponse(AppointUnplacedWorkDesignationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'UNPLACED_WORK_DESIGNATION.APPOINTED',
    description:
      'Designates an active IT Admin to handle one or more specific works belonging to an employee who has never been placed in a department.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    SUPER_ADMIN_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (EMPLOYEE.NOT_FOUND).',
      examples: [UNPLACED_WORK_DESIGNATION_ERROR_EXAMPLES.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The employee already has a department placement record (UNPLACED_WORK_DESIGNATION.EMPLOYEE_PLACED) or at least one work already has an active designation (UNPLACED_WORK_DESIGNATION.ALREADY_ACTIVE).',
      examples: [
        UNPLACED_WORK_DESIGNATION_ERROR_EXAMPLES.EMPLOYEE_PLACED,
        UNPLACED_WORK_DESIGNATION_ERROR_EXAMPLES.ALREADY_ACTIVE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the designee is not an active employee with a usable IT Admin account (UNPLACED_WORK_DESIGNATION.NOT_USABLE_IT_ADMIN).',
      examples: [VALIDATION_EXAMPLE, UNPLACED_WORK_DESIGNATION_ERROR_EXAMPLES.NOT_USABLE_IT_ADMIN],
    },
  )
  async appoint(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Body() body: AppointUnplacedWorkDesignationBodyDto,
  ) {
    try {
      const result = await this.designations.appoint(actor, body);

      return { items: result.items.map(toUnplacedWorkDesignationWire) };
    } catch (error) {
      throw toUnplacedWorkDesignationApiException(error);
    }
  }

  @Post(':id/end')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'unplacedWorkDesignationEnd',
    summary: 'End an active unplaced-work IT Admin designation',
  })
  @ApiSuccessResponse(UnplacedWorkDesignationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'UNPLACED_WORK_DESIGNATION.ENDED',
    description: 'Ends the active unplaced-work IT Admin designation with endCause REMOVED.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    SUPER_ADMIN_ONLY,
    VALIDATION_ERROR,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The designation does not exist (UNPLACED_WORK_DESIGNATION.NOT_FOUND).',
      examples: [UNPLACED_WORK_DESIGNATION_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The designation has already ended (UNPLACED_WORK_DESIGNATION.ALREADY_ENDED).',
      examples: [UNPLACED_WORK_DESIGNATION_ERROR_EXAMPLES.ALREADY_ENDED],
    },
  )
  async end(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: UnplacedWorkDesignationIdParamDto) {
    try {
      return toUnplacedWorkDesignationWire(await this.designations.end(actor, params.id));
    } catch (error) {
      throw toUnplacedWorkDesignationApiException(error);
    }
  }

  @Get()
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({
    operationId: 'unplacedWorkDesignationList',
    summary: 'List unplaced-work IT Admin designations',
  })
  @ApiSuccessResponse(UnplacedWorkDesignationPageResponseDto, {
    message: 'UNPLACED_WORK_DESIGNATION.LISTED',
    description:
      'A page of unplaced-work IT Admin designations ordered by appointedAt descending then id. IT Admins see only designations naming them as designee.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READ_ROLES_ONLY, VALIDATION_ERROR)
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ListUnplacedWorkDesignationsQueryDto,
  ) {
    try {
      const page = await this.designations.list(principal, query);

      return { items: page.items.map(toUnplacedWorkDesignationWire), pagination: page.pagination };
    } catch (error) {
      throw toUnplacedWorkDesignationApiException(error);
    }
  }
}
