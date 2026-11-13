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
import { OffboardingDetailResponseDto, OffboardingIdParamDto } from '../offboarding/offboarding.dto';
import { OFFBOARDING_ERROR_EXAMPLES, toOffboardingApiException } from '../offboarding/offboarding.http-errors';
import { OffboardingViewService } from '../offboarding/offboarding-view.service';
import { RecordMailboxLockBodyDto } from './departure-closure.dto';
import { MailboxLockService } from './mailbox-lock.service';

const E = OFFBOARDING_ERROR_EXAMPLES;

/**
 * The step that ends the technical work of a departure, which is the IT Admin's (`QĐ-87a`): the lock of the mailbox for good (item 1b of
 * `BM-08`, `B-1`). The role is judged again by the service, so this guard is only the outer layer. Closing the case is the system's
 * (`QĐ-110e`): there is no route for it.
 */
@ApiTags('offboarding-cases')
@Controller({ path: 'offboarding-cases', version: '1' })
export class MailboxLockController {
  constructor(
    private readonly locks: MailboxLockService,
    private readonly views: OffboardingViewService,
  ) {}

  @Post(':id/mailbox-lock')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'offboardingCaseRecordMailboxLock',
    summary: 'Record the lock of the mailbox for good (item 1b)',
  })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.MAILBOX_LOCK_RECORDED',
    description:
      'Item (1b) of BM-08, written once after (1a): who locked the mailbox of the person for good at the company, when, and the words the IT Admin adds (optional). A person who holds a K1 seat has the mailbox locked after every revocation of a K1 seat is completed: the system writes it by itself when the IT Admin ticks the last step of the checklist of the last K1 revocation, and the IT Admin writes it here for a person who holds none (right after the lock of the account) or when the last revocation did not tick it. Asking again answers 200 with the case as it is. The case closes by itself when the person has left, every revocation is completed and (1b) is written.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin records the lock of the mailbox (AUTHORIZATION.FORBIDDEN).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The offboarding case does not exist (OFFBOARDING_CASE.NOT_FOUND).',
      examples: [E.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The person is not blocked yet (OFFBOARDING_CASE.CASE_NOT_BLOCKED) or the case is closed (CASE_CLOSED), the lock of the company account (1a) is not recorded (ACCOUNT_LOCK_FIRST), the person still holds a K1 seat whose revocation is not completed (MAILBOX_LOCK_BEFORE_K1, with the count in the details), or the person or the case was changed meanwhile (CONCURRENT_CHANGE).',
      examples: [
        E.CASE_NOT_BLOCKED,
        E.CASE_CLOSED,
        E.ACCOUNT_LOCK_FIRST,
        E.MAILBOX_LOCK_BEFORE_K1,
        E.CONCURRENT_CHANGE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not valid, or the body is invalid or the note is empty (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async recordMailboxLock(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: RecordMailboxLockBodyDto,
  ) {
    try {
      return await this.views.stepResult(await this.locks.record(actor, params.id, body));
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }
}
