import { Body, Controller, HttpStatus, Param, Patch } from '@nestjs/common';
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
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ORGANIZATION_ERROR_EXAMPLES, toOrganizationApiException } from '../mappers/organization.http-errors';
import { EmployeeIdParamDto, MaintainedEmployeeResponseDto, UpdateEmployeeBodyDto } from './employee.dto';
import { EmployeeMaintenanceService } from './employee-maintenance.service';

/**
 * Correcting the official fields of an employee record on an HR basis (`US-02-02` AC-19). The Super Admin does it (`QĐ-87a`), the IT
 * Admin does not, and nobody does it on their own record here: that goes through the controlled procedure (`QĐ-87c`). The
 * department and the status are never changed here. Who may is decided by the policy of the service as well as by the role of the
 * route (`F13`).
 */
@ApiTags('employees')
@Controller({ path: 'employees', version: '1' })
@RequireRoles('SUPER_ADMIN')
export class EmployeeMaintenanceController {
  constructor(private readonly maintenance: EmployeeMaintenanceService) {}

  @Patch(':id')
  @ApiOperation({ operationId: 'employeeUpdateOfficialFields', summary: 'Correct the official fields of an employee' })
  @ApiSuccessResponse(MaintainedEmployeeResponseDto, {
    message: 'EMPLOYEE.UPDATED',
    description:
      'The name, work email, kind of staff, job title (free text; null clears it) or a hire date still to come were changed on the HR basis given; the Audit Trail keeps the values before and after and the basis, and the employee and the head of their department are told. The login email, the department and the status are untouched.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only the Super Admin corrects these fields, and not their own record (EMPLOYEE.SELF_CHANGE_FORBIDDEN: that goes through the controlled procedure outside the application).',
      examples: [FORBIDDEN_EXAMPLE, ORGANIZATION_ERROR_EXAMPLES.EMPLOYEE_SELF_CHANGE_FORBIDDEN],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (EMPLOYEE.NOT_FOUND).',
      examples: [ORGANIZATION_ERROR_EXAMPLES.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is malformed, names a field that is not an official one or lacks a part of the HR basis (VALIDATION_ERROR), names nothing to change (EMPLOYEE.UPDATE_EMPTY), or a value is refused (EMPLOYEE.ROW_INVALID: WORK_EMAIL_TAKEN, HIRE_DATE_LOCKED, HIRE_DATE_IN_PAST, JOB_TITLE_TOO_LONG, OPEN_ASSIGNMENT_NEEDS_EXPECTED_END — a contractor, freelancer or intern needs an expected end on every open seat).',
      examples: [
        VALIDATION_EXAMPLE,
        ORGANIZATION_ERROR_EXAMPLES.EMPLOYEE_UPDATE_ROW_INVALID,
        ORGANIZATION_ERROR_EXAMPLES.EMPLOYEE_UPDATE_EMPTY,
      ],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: EmployeeIdParamDto,
    @Body() body: UpdateEmployeeBodyDto,
  ) {
    try {
      return await this.maintenance.update(actor, params.id, body);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
