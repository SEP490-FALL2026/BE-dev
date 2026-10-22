import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AssignmentView } from '../licensing.types';
import { toLicensingApiException } from '../mappers/licensing.http-errors';
import {
  AssignmentIdParamDto,
  AssignmentPageResponseDto,
  ListAssignmentsQueryDto,
  ResponsibleChangeBodyDto,
  ResponsibleChangeResponseDto,
} from './assignment.dto';
import { AssignmentService } from './assignment.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin reads or changes the assignments of seats.',
} as const;

const toWire = (view: AssignmentView) => ({
  ...view,
  failedAt: view.failedAt?.toISOString() ?? null,
  createdAt: view.createdAt.toISOString(),
});

/**
 * The assignments of seats (`US-02-05`). They are read here and are created by the seat baseline import and by a change of
 * the person responsible for a service account; there is no route that creates one from nothing, and none that
 * deletes one (a baseline that is closed takes no assignment without a request, `AC-6`).
 */
@ApiTags('license-assignments')
@Controller({ path: 'license-assignments', version: '1' })
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentService) {}

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'licenseAssignmentList', summary: 'List license assignments' })
  @ApiSuccessResponse(AssignmentPageResponseDto, {
    message: 'LICENSE_ASSIGNMENT.LISTED',
    description:
      'A page of assignments by start date. source tells a baseline assignment from one that came from a request or from a change of the person responsible; a start that is only the day of recording has no grantedOn and carries a label.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
  })
  async list(@Query() query: ListAssignmentsQueryDto) {
    try {
      const page = await this.assignments.list(query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toLicensingApiException(error);
    }
  }

  @Post(':id/responsible-changes')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'licenseAssignmentChangeResponsible',
    summary: 'Change the person responsible for a service account',
  })
  @ApiSuccessResponse(ResponsibleChangeResponseDto, {
    message: 'LICENSE_ASSIGNMENT.RESPONSIBLE_CHANGED',
    description:
      'The old assignment ends the day the change takes effect and the new one begins that day, with the same kind, Cost Center, reason and account identifier, chained to the old one. The seats taken do not change on any day.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    { status: HttpStatus.NOT_FOUND, description: 'The assignment does not exist (LICENSE_ASSIGNMENT.NOT_FOUND).' },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The assignment has ended or is set to end (LICENSE_ASSIGNMENT.NOT_OPEN), or the seats are all taken (LICENSE_ASSIGNMENT.SEAT_CAPACITY).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or refused: LICENSE_ASSIGNMENT.NOT_SERVICE_ACCOUNT, RESPONSIBLE_INVALID, EFFECTIVE_DATE_INVALID, EXPECTED_END_REQUIRED, OVERLAP or IDENTIFIER_IN_USE.',
    },
  )
  async changeResponsible(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: AssignmentIdParamDto,
    @Body() body: ResponsibleChangeBodyDto,
  ) {
    try {
      const { ended, created } = await this.assignments.changeResponsible(actor, params.id, {
        employeeId: body.employeeId,
        effectiveFrom: body.effectiveFrom,
        expectedEndDate: body.expectedEndDate ?? null,
      });

      return { ended: toWire(ended), created: toWire(created) };
    } catch (error) {
      throw toLicensingApiException(error);
    }
  }
}
