import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
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
import {
  OffboardingDetailResponseDto,
  OffboardingIdParamDto,
  OffboardingRevocationsOpenedResponseDto,
  OpenRevocationsBodyDto,
  RecordAccountLockBodyDto,
} from './offboarding.dto';
import { OFFBOARDING_ERROR_EXAMPLES, toOffboardingApiException } from './offboarding.http-errors';
import { OffboardingLeftService } from './offboarding-left.service';
import { OffboardingRevocationService } from './offboarding-revocation.service';
import { OffboardingDetailService } from './detail/offboarding-detail.service';

const E = OFFBOARDING_ERROR_EXAMPLES;
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only an IT Admin records the lock of the account, takes the rights away or closes a departure (AUTHORIZATION.FORBIDDEN).',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The offboarding case does not exist, or an IT Admin reads one of a department they are not in charge of (OFFBOARDING_CASE.NOT_FOUND).',
  examples: [E.NOT_FOUND],
} as const;
const ID_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is not valid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const CONCURRENT = 'the person or the case was changed meanwhile (CONCURRENT_CHANGE)';
const LOCK_REFUSALS = [E.ACCOUNT_LOCK_NOT_RECORDED, E.ALREADY_RECORDED] as const;

/**
 * The technical steps that follow the departure of a person, which are the IT Admin's (`QĐ-87a`): the lock of the company account, the
 * revocations of the rights and the closing of the case. The role is judged again by the service, so this guard is only the outer
 * layer. The events of the departure (the record, the last working day, the cancellation, the departure) are the Super Admin's and are
 * in `OffboardingController`. Nothing is revoked by itself.
 */
@ApiTags('offboarding-cases')
@Controller({ path: 'offboarding-cases', version: '1' })
export class OffboardingStepsController {
  constructor(
    private readonly left: OffboardingLeftService,
    private readonly revocations: OffboardingRevocationService,
    private readonly detail: OffboardingDetailService,
  ) {}

  @Post(':id/account-lock')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseRecordAccountLock', summary: 'Record the lock of the company account' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.ACCOUNT_LOCK_RECORDED',
    description:
      'Who locked the company account, the sessions and the device credentials of the person, outside the system, when, and what was done, written once. The revocations of the rights need it first or with them.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The person is not blocked yet (OFFBOARDING_CASE.CASE_NOT_BLOCKED: the last working day has not passed and they have not left) or the lock was recorded already (ALREADY_RECORDED).',
      examples: [E.CASE_NOT_BLOCKED, E.ALREADY_RECORDED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body is invalid or the note is empty (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async recordAccountLock(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: RecordAccountLockBodyDto,
  ) {
    try {
      return await this.detail.detailOf(await this.left.recordAccountLock(actor, params.id, body), 'MINIMAL');
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/revocations')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseOpenRevocations', summary: 'Take the rights of the person away' })
  @ApiSuccessResponse(OffboardingRevocationsOpenedResponseDto, {
    message: 'OFFBOARDING_CASE.REVOCATIONS_OPENED',
    description:
      'A task of the queue was made for each right chosen (all that have none when none is named), after the lock of the company account is recorded or together with it, with the standard reason of a departure (and the note the IT Admin adds); the server counts the rights. The seats stay whole until each task is done; nothing is transferred to anyone. A seat that has a task already gets the reason added.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: `The person is not blocked yet (OFFBOARDING_CASE.CASE_NOT_BLOCKED) or the case is closed (CASE_CLOSED), the lock of the company account is not recorded (ACCOUNT_LOCK_NOT_RECORDED) or was recorded already (ALREADY_RECORDED), a seat named has no revocation (REVOCATION_NOT_SUPPORTED), there is nothing left to take away (NOTHING_TO_REVOKE), or ${CONCURRENT}.`,
      examples: [E.CASE_NOT_BLOCKED, E.CASE_CLOSED, ...LOCK_REFUSALS, E.REVOCATION_NOT_SUPPORTED, E.NOTHING_TO_REVOKE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid, such as one that still sends a count or a reason (VALIDATION_ERROR), or a seat named is not held or has a task (ASSIGNMENT_NOT_AVAILABLE): nothing is made.',
      examples: [VALIDATION_EXAMPLE, E.ASSIGNMENT_NOT_AVAILABLE],
    },
  )
  async openRevocations(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: OpenRevocationsBodyDto,
  ) {
    try {
      const opened = await this.revocations.openRevocations(actor, params.id, body);
      const detail = await this.detail.detailOf(opened.record, 'MINIMAL');

      return { ...detail, revocations: { created: opened.created, reasonAdded: opened.reasonAdded } };
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/closure')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseClose', summary: 'Close a departure' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.CLOSED',
    description:
      'The case is closed: the company account is recorded as locked and the person holds no personal right any more, and nothing registered by the flows that come after keeps it open.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The person has not left yet (OFFBOARDING_CASE.CASE_NOT_LEFT), or something keeps the case open (CASE_NOT_CLOSEABLE, with the codes in the details): the lock of the account is not recorded, a personal right is held (also one whose access runs on to the end of the paid period), or a later flow still waits.',
      examples: [E.CASE_NOT_LEFT, E.CASE_NOT_CLOSEABLE],
    },
    ID_INVALID,
  )
  async close(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: OffboardingIdParamDto) {
    try {
      return await this.detail.detailOf(await this.revocations.close(actor, params.id), 'MINIMAL');
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }
}
