import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { AccountInvitationService } from './account-invitation.service';
import { AccountDetailView, AccountQueryService, AccountView } from './account-query.service';
import { AccountStatusService } from './account-status.service';
import { toAccountApiException } from './account.http-errors';
import {
  AccountCandidatesQueryDto,
  AccountCandidatesResponseDto,
  AccountStatusChangeBodyDto,
  AccountDetailResponseDto,
  AccountPageResponseDto,
  AppUserIdParamDto,
  AppUserRoleParamDto,
  CreateAppUserBodyDto,
  GrantRoleBodyDto,
  ListAppUsersQueryDto,
} from '../dto/account-management.dto';

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
  { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin may call this route.' },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;

const STATUS_CHANGE_VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The identifier is not a UUID, or the reason is missing, blank, longer than 1000 characters ' +
    'or sent with other fields (VALIDATION_ERROR). Nothing changes.',
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
    description: 'The account was created (invited) and its invitation queued.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    { status: HttpStatus.NOT_FOUND, description: 'The employee does not exist.' },
    {
      status: HttpStatus.CONFLICT,
      description: 'The employee left, already has an account, or the email or Finance seat is taken.',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body is invalid or a requested role cannot be granted by hand.',
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
  @ApiOperation({ operationId: 'appUserList', summary: 'List accounts' })
  @ApiSuccessResponse(AccountPageResponseDto, { message: 'APP_USER.LISTED', description: 'A page of accounts.' })
  @ApiErrorResponses(...COMMON_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid.',
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
    { status: HttpStatus.NOT_FOUND, description: 'No account has this identifier.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The identifier is not a UUID.' },
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
    { status: HttpStatus.NOT_FOUND, description: 'No account has this identifier.' },
    {
      status: HttpStatus.CONFLICT,
      description: 'The account is activated, locked, belongs to a departed employee, or is the caller.',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The identifier is not a UUID (VALIDATION_ERROR).' },
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
    { status: HttpStatus.NOT_FOUND, description: 'No account has this identifier.' },
    { status: HttpStatus.CONFLICT, description: 'The caller, or the holder of SUPER_ADMIN, cannot be locked.' },
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
    description: 'The account is active again.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    { status: HttpStatus.NOT_FOUND, description: 'No account has this identifier.' },
    { status: HttpStatus.CONFLICT, description: 'The caller cannot change their own account.' },
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

  @Post('app-users/:id/role-grants')
  @ApiOperation({ operationId: 'appUserGrantRole', summary: 'Grant a role to an account' })
  @ApiSuccessResponse(AccountDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ROLE.GRANTED',
    description: 'The role is granted and takes effect at the account next request.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    { status: HttpStatus.NOT_FOUND, description: 'No account has this identifier.' },
    {
      status: HttpStatus.CONFLICT,
      description: 'Already granted, forbidden combination, Finance seat taken, or the caller.',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The role is derived or moves only by transfer.' },
  )
  async grantRole(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: AppUserIdParamDto,
    @Body() body: GrantRoleBodyDto,
  ) {
    try {
      await this.status.grantRole(actor, params.id, body.role);

      return toDetailWire(await this.queries.getAccount(params.id));
    } catch (error) {
      throw toAccountApiException(error);
    }
  }

  @Delete('app-users/:id/role-grants/:role')
  @ApiOperation({ operationId: 'appUserRevokeRole', summary: 'Revoke a role from an account' })
  @ApiSuccessResponse(AccountDetailResponseDto, {
    message: 'ROLE.REVOKED',
    description: 'The role is revoked (the last role may be revoked); it stops at the next request.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    { status: HttpStatus.NOT_FOUND, description: 'No such account, or it does not hold this role.' },
    { status: HttpStatus.CONFLICT, description: 'The caller cannot change their own account.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The role is derived or moves only by transfer.' },
  )
  async revokeRole(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: AppUserRoleParamDto) {
    try {
      await this.status.revokeRole(actor, params.id, params.role);

      return toDetailWire(await this.queries.getAccount(params.id));
    } catch (error) {
      throw toAccountApiException(error);
    }
  }
}
