import { Body, Controller, Get, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  VALIDATION_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccountInvitationService } from './account-invitation.service';
import { AccountDetailView, AccountQueryService, AccountView } from './account-query.service';
import { AccountStatusService } from './account-status.service';
import {
  AccountCandidatesQueryDto,
  AccountCandidatesResponseDto,
  AccountStatusChangeBodyDto,
  AccountDetailResponseDto,
  AccountPageResponseDto,
  AppUserIdParamDto,
  CreateAppUserBodyDto,
  ChangeRoleBodyDto,
  ListAppUsersQueryDto,
} from '../account-management.dto';
import { ACCOUNT_ERROR_EXAMPLES, toAccountApiException } from '../account.http-errors';

const iso = (value: Date): string => value.toISOString();

function toAccountWire(view: AccountView) {
  return { ...view, createdAt: iso(view.createdAt) };
}

function toDetailWire(view: AccountDetailView) {
  return {
    ...toAccountWire(view),
    roleHistory: view.roleHistory.map((entry) => ({
      role: entry.role,
      grantedAt: iso(entry.grantedAt),
      revokedAt: entry.revokedAt ? iso(entry.revokedAt) : null,
    })),
    roleHistoryHasMore: view.roleHistoryHasMore,
    invitation: view.invitation
      ? {
          usable: view.invitation.usable,
          expiresAt: iso(view.invitation.expiresAt),
          delivery: view.invitation.delivery
            ? {
                status: view.invitation.delivery.status,
                attempts: view.invitation.delivery.attempts,
                lastErrorCode: view.invitation.delivery.lastErrorCode,
                sentAt: view.invitation.delivery.sentAt ? iso(view.invitation.delivery.sentAt) : null,
              }
            : null,
        }
      : null,
  };
}

const COMMON_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the Super Admin may call this route.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;

const STATUS_CHANGE_VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The identifier is not a UUID, or the reason is missing, blank, longer than 1000 characters ' +
    'or sent with other fields (VALIDATION_ERROR). Nothing changes.',
  examples: [VALIDATION_EXAMPLE],
} as const;

/** Account administration. Super Admin only; a role other than SUPER_ADMIN gets 403 and nothing changes (AC-3). */
@ApiTags('app-users')
@Controller({ version: '1' })
@RequireRoles('SUPER_ADMIN')
export class AppUsersController {
  constructor(
    private readonly queries: AccountQueryService,
    private readonly invitations: AccountInvitationService,
    private readonly status: AccountStatusService,
  ) {}

  @Get('account-candidates')
  @ApiOperation({ operationId: 'accountCandidatesList', summary: 'Find employees who can get an account' })
  @ApiSuccessResponse(AccountCandidatesResponseDto, {
    message: 'APP_USER.CANDIDATES_LISTED',
    description: 'Employees who have not left and have no account yet (at most 20).',
  })
  @ApiErrorResponses(...COMMON_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid.',
    examples: [VALIDATION_EXAMPLE],
  })
  async listCandidates(@Query() query: AccountCandidatesQueryDto) {
    try {
      return { items: await this.queries.listCandidates(query.search) };
    } catch (error) {
      throw toAccountApiException(error);
    }
  }

  @Post('app-users')
  @ApiOperation({ operationId: 'appUserCreate', summary: 'Create an account for an employee' })
  @ApiSuccessResponse(AccountDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'APP_USER.CREATED',
    description: 'The account was created with one role (EMPLOYEE by default), invited and its invitation queued.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist.',
      examples: [ACCOUNT_ERROR_EXAMPLES.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The employee left, already has an account, or the email or Finance seat is taken.',
      examples: [
        ACCOUNT_ERROR_EXAMPLES.EMPLOYEE_TERMINATED,
        ACCOUNT_ERROR_EXAMPLES.ALREADY_EXISTS_FOR_EMPLOYEE,
        ACCOUNT_ERROR_EXAMPLES.LOGIN_EMAIL_TAKEN,
        ACCOUNT_ERROR_EXAMPLES.FINANCE_ALREADY_ASSIGNED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid, or a requested role cannot be granted by hand, or the new account cannot hold SPENDING_APPROVER.',
      examples: [
        VALIDATION_EXAMPLE,
        ACCOUNT_ERROR_EXAMPLES.SUPER_ADMIN_TRANSFER_ONLY,
        ACCOUNT_ERROR_EXAMPLES.SPENDING_APPROVER_ACCOUNT_NOT_USABLE,
        ACCOUNT_ERROR_EXAMPLES.LOGIN_EMAIL_REQUIRED,
        ACCOUNT_ERROR_EXAMPLES.LOGIN_EMAIL_INVALID,
      ],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateAppUserBodyDto) {
    try {
      const id = await this.invitations.createAccount(actor, body);

      return toDetailWire(await this.queries.getAccount(id));
    } catch (error) {
      throw toAccountApiException(error);
    }
  }

  @Get('app-users')
  @ApiOperation({
    operationId: 'appUserList',
    summary: 'List accounts',
    description: 'Filter by department membership on a date; memberOn requires departmentId.',
  })
  @ApiSuccessResponse(AccountPageResponseDto, { message: 'APP_USER.LISTED', description: 'A page of accounts.' })
  @ApiErrorResponses(...COMMON_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid.',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: ListAppUsersQueryDto) {
    try {
      const page = await this.queries.listAccounts(query);

      return { items: page.items.map(toAccountWire), pagination: page.pagination };
    } catch (error) {
      throw toAccountApiException(error);
    }
  }

  @Get('app-users/:id')
  @ApiOperation({ operationId: 'appUserGet', summary: 'Get an account' })
  @ApiSuccessResponse(AccountDetailResponseDto, {
    message: 'APP_USER.RETRIEVED',
    description: 'The account with its role history and invitation state.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No account has this identifier.',
      examples: [ACCOUNT_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The identifier is not a UUID.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async get(@Param() params: AppUserIdParamDto) {
    try {
      return toDetailWire(await this.queries.getAccount(params.id));
    } catch (error) {
      throw toAccountApiException(error);
    }
  }

  @Post('app-users/:id/invitations')
  @ApiOperation({ operationId: 'appUserResendInvitation', summary: 'Send a new invitation' })
  @ApiSuccessResponse(AccountDetailResponseDto, {
    status: HttpStatus.ACCEPTED,
    message: 'APP_USER.INVITATION_SENT',
    description: 'A new invitation was queued; the previous one no longer works.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No account has this identifier.',
      examples: [ACCOUNT_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The account is activated, locked, belongs to a departed employee, or is the caller.',
      examples: [
        ACCOUNT_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN,
        ACCOUNT_ERROR_EXAMPLES.ALREADY_ACTIVATED,
        ACCOUNT_ERROR_EXAMPLES.ACCOUNT_LOCKED,
        ACCOUNT_ERROR_EXAMPLES.EMPLOYEE_TERMINATED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The identifier is not a UUID (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async resendInvitation(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: AppUserIdParamDto) {
    try {
      await this.invitations.resendInvitation(actor, params.id);

      return toDetailWire(await this.queries.getAccount(params.id));
    } catch (error) {
      throw toAccountApiException(error);
    }
  }

  @Post('app-users/:id/lock')
  @ApiOperation({ operationId: 'appUserLock', summary: 'Lock an account' })
  @ApiSuccessResponse(AccountDetailResponseDto, {
    message: 'APP_USER.LOCKED',
    description: 'The account is locked; its sessions and unused invitation are ended.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No account has this identifier.',
      examples: [ACCOUNT_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The caller, or the holder of SUPER_ADMIN, cannot be locked.',
      examples: [ACCOUNT_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN, ACCOUNT_ERROR_EXAMPLES.SUPER_ADMIN_HOLDER_NOT_LOCKABLE],
    },
    STATUS_CHANGE_VALIDATION_ERROR,
  )
  async lock(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: AppUserIdParamDto,
    @Body() body: AccountStatusChangeBodyDto,
  ) {
    try {
      await this.status.lock(actor, params.id, body.reason);

      return toDetailWire(await this.queries.getAccount(params.id));
    } catch (error) {
      throw toAccountApiException(error);
    }
  }

  @Post('app-users/:id/unlock')
  @ApiOperation({ operationId: 'appUserUnlock', summary: 'Unlock an account' })
  @ApiSuccessResponse(AccountDetailResponseDto, {
    message: 'APP_USER.UNLOCKED',
    description:
      'The account is active again. When the departure of its employee was cancelled after the block took effect, the block is lifted in the same act (departureBlockReleased in the Audit Trail).',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No account has this identifier.',
      examples: [ACCOUNT_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The caller cannot change their own account, or the departure of its employee is still under way and keeps the access blocked (APP_USER.ACCESS_BLOCK_NOT_RELEASABLE).',
      examples: [ACCOUNT_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN, ACCOUNT_ERROR_EXAMPLES.ACCESS_BLOCK_NOT_RELEASABLE],
    },
    STATUS_CHANGE_VALIDATION_ERROR,
  )
  async unlock(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: AppUserIdParamDto,
    @Body() body: AccountStatusChangeBodyDto,
  ) {
    try {
      await this.status.unlock(actor, params.id, body.reason);

      return toDetailWire(await this.queries.getAccount(params.id));
    } catch (error) {
      throw toAccountApiException(error);
    }
  }

  @Put('app-users/:id/role')
  @ApiOperation({ operationId: 'appUserChangeRole', summary: 'Change the role of an account' })
  @ApiSuccessResponse(AccountDetailResponseDto, {
    message: 'ROLE.CHANGED',
    description:
      'Replaces the current role atomically. The same role is a no-op; changes take effect on the next request.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No account has this identifier.',
      examples: [ACCOUNT_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Self change, a Manager still heading a department, an occupied Finance or spending approver role, or open work blocking the spending approver.',
      examples: [
        ACCOUNT_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN,
        ACCOUNT_ERROR_EXAMPLES.MANAGER_STILL_HEADING,
        ACCOUNT_ERROR_EXAMPLES.FINANCE_ALREADY_ASSIGNED,
        ACCOUNT_ERROR_EXAMPLES.SPENDING_APPROVER_ALREADY_ASSIGNED,
        ACCOUNT_ERROR_EXAMPLES.SPENDING_APPROVER_HAS_OPEN_WORK,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'Invalid input, the Super Admin role changes only outside the application, or the spending approver account or employee is not usable.',
      examples: [
        VALIDATION_EXAMPLE,
        ACCOUNT_ERROR_EXAMPLES.SUPER_ADMIN_TRANSFER_ONLY,
        ACCOUNT_ERROR_EXAMPLES.SPENDING_APPROVER_EMPLOYEE_NOT_ACTIVE,
        ACCOUNT_ERROR_EXAMPLES.SPENDING_APPROVER_ACCOUNT_NOT_USABLE,
      ],
    },
  )
  async changeRole(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: AppUserIdParamDto,
    @Body() body: ChangeRoleBodyDto,
  ) {
    try {
      await this.status.changeRole(actor, params.id, body.role);
      return toDetailWire(await this.queries.getAccount(params.id));
    } catch (error) {
      throw toAccountApiException(error);
    }
  }
}
