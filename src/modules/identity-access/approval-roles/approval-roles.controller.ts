import { Body, Controller, Get, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ApprovalRoleParamDto, ApprovalRolesResponseDto, SetApprovalRoleBodyDto } from '../dto/approval-role.dto';
import { toApprovalRoleApiException } from './approval-role.errors';
import { ApprovalRoleService, ApprovalRoleView } from './approval-role.service';

const COMMON_ERRORS = [
  { status: HttpStatus.UNAUTHORIZED, description: 'Authentication is required or the token is no longer valid.' },
  { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin configures the approval roles (US-01-03 AC-4).' },
  {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description:
      'Authentication or the service is temporarily unavailable (TOKEN_VERIFICATION_UNAVAILABLE from the guard, SERVICE_UNAVAILABLE after it).',
  },
] as const;

function toWire(views: ApprovalRoleView[]) {
  return {
    items: views.map((view) => ({
      role: view.role,
      holder: view.holder ? { ...view.holder, since: view.holder.since.toISOString() } : null,
      history: view.history.map((entry) => ({
        employeeId: entry.employeeId,
        employeeCode: entry.employeeCode,
        fullName: entry.fullName,
        from: entry.from.toISOString(),
        until: entry.until ? entry.until.toISOString() : null,
      })),
    })),
  };
}

/**
 * The approval roles (`US-01-03`). The Super Admin sets who holds each; setting a role is configuration, not an
 * approval (`SoD-1`), and nobody can name someone to approve in place of another for one request (AC-5): there is
 * no such route.
 */
@ApiTags('approval-roles')
@Controller({ path: 'approval-roles', version: '1' })
export class ApprovalRolesController {
  constructor(private readonly roles: ApprovalRoleService) {}

  @Get()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'approvalRoleList' })
  @ApiSuccessResponse(ApprovalRolesResponseDto, {
    message: 'APPROVAL_ROLE.LISTED',
    description: 'The three approval roles, who holds each now (or nobody) and who held it before.',
  })
  @ApiErrorResponses(...COMMON_ERRORS)
  async list() {
    try {
      return toWire(await this.roles.list());
    } catch (error) {
      throw toApprovalRoleApiException(error);
    }
  }

  @Put(':role')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'approvalRoleSet' })
  @ApiSuccessResponse(ApprovalRolesResponseDto, {
    message: 'APPROVAL_ROLE.SET',
    description:
      'The person holds the role from now on; whoever held it before stops. Naming the person who already holds it changes nothing.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (ORGANIZATION.EMPLOYEE_NOT_FOUND).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the person has left or has no account that can sign in (APPROVAL_ROLE.EMPLOYEE_NOT_ACTIVE, APPROVAL_ROLE.NO_USABLE_ACCOUNT), holds the Super Admin role (APPROVAL_ROLE.SUPER_ADMIN_CANNOT_HOLD), or the substitute would be the spending approver (APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER).',
    },
  )
  async set(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ApprovalRoleParamDto,
    @Body() body: SetApprovalRoleBodyDto,
  ) {
    try {
      return toWire(await this.roles.set(actor, params.role, body.employeeId));
    } catch (error) {
      throw toApprovalRoleApiException(error);
    }
  }
}
