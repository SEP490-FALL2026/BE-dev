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
import { toLicensingApiException } from '../licensing.http-errors';
import { AssignmentPageResponseDto, ListAssignmentsQueryDto } from './assignment.dto';
import { AssignmentListService } from './assignment-list.service';
import { toAssignmentWire } from './assignment.mapper';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin reads or changes the assignments of seats.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

/**
 * The assignments of seats (`US-02-05`). They are read here and are created by the seat baseline import, by a grant and by the
 * renewal of their subscription; there is no route that creates one from nothing, and none that deletes one (a baseline that is
 * closed takes no assignment without a request, `AC-6`). The flag of a machine account is `machine-account/`.
 */
@ApiTags('license-assignments')
@Controller({ path: 'license-assignments', version: '1' })
export class AssignmentsController {
  constructor(private readonly assignmentList: AssignmentListService) {}

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'licenseAssignmentList', summary: 'List license assignments' })
  @ApiSuccessResponse(AssignmentPageResponseDto, {
    message: 'LICENSE_ASSIGNMENT.LISTED',
    description:
      'A page of assignments by start date, each with the person, the plan and the Cost Center it names. source tells a baseline assignment from one that came from a request, a renewal or the conversion of a former service account (MACHINE_ACCOUNT_CONVERSION); isMachineAccount is on for the seat of an IT Admin used for a machine account, with its reason in machineAccountNote; a start that is only the day of recording has no grantedOn and carries a label.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: ListAssignmentsQueryDto) {
    try {
      const page = await this.assignmentList.list(query);

      return { items: page.items.map(toAssignmentWire), pagination: page.pagination };
    } catch (error) {
      throw toLicensingApiException(error);
    }
  }
}
