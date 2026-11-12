import { Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  ExpiryAssignmentParamDto,
  ExpiryQueuePageResponseDto,
  ExpiryReminderPageResponseDto,
  ListExpiryQueueQueryDto,
  ListExpiryRemindersQueryDto,
  StartedRevocationResponseDto,
} from './expiry.dto';
import { EXPIRY_ERROR_EXAMPLES as EXAMPLES, toExpiryApiException } from './expiry.http-errors';
import { ExpiryQueueService } from './expiry-queue.service';
import { ExpiryReminderService } from './expiry-reminder.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * The rights of people that end on a day: the queue of those that ended and are still held, the start of their revocation, and the
 * reminders sent before they end. Nothing here revokes or renews a right by itself.
 */
@ApiTags('assignment-expiry')
@Controller({ version: '1' })
export class ExpiryController {
  constructor(
    private readonly queue: ExpiryQueueService,
    private readonly reminders: ExpiryReminderService,
  ) {}

  @Get('assignment-expiry-queue')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'assignmentExpiryQueueList', summary: 'List the rights that ended and are still held' })
  @ApiSuccessResponse(ExpiryQueuePageResponseDto, {
    message: 'ASSIGNMENT_EXPIRY_QUEUE.LISTED',
    description:
      'A page of the open personal rights whose end day has passed, the earliest end first. A right is still in force while it is here: nothing revokes or renews it by itself. A row names the person, their department, the tool and the plan, the end day, the days past it and a debt flag set after seven days. Its status is WAITING_RENEWAL_DECISION while a renewal sent in time is not decided (the right stays as it is), READY_TO_REVOKE otherwise, and REVOCATION_OPEN once a revocation is under way, with that revocation. Filter by status, by debt or by department. A renewal that was approved ends the old record and the right leaves the queue.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the queue.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'A filter is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Query() query: ListExpiryQueueQueryDto) {
    try {
      return await this.queue.list(query);
    } catch (error) {
      throw toExpiryApiException(error);
    }
  }

  @Post('assignment-expiry-queue/:assignmentId/revocation')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'assignmentExpiryStartRevocation',
    summary: 'Start the revocation of a right that ended',
  })
  @ApiSuccessResponse(StartedRevocationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ASSIGNMENT_EXPIRY.REVOCATION_STARTED',
    description:
      'Opens the revocation of the right with the source of an expired right, through the same gate every other source uses: a task of the provisioning queue, or the reason added to the one the right already has. Asking again changes nothing. The right stays in force until the task is completed with its evidence; a task that fails leaves the right held and in the queue with that task.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin starts the revocation.',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.ANOTHER_IT_ADMIN_NEEDED],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The right does not exist or does not end on a day (ASSIGNMENT_EXPIRY.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The right was ended already (ASSIGNMENT_EXPIRY.NOT_OPEN), its end day has not passed (ASSIGNMENT_EXPIRY.NOT_EXPIRED), a renewal sent in time waits for its decision (ASSIGNMENT_EXPIRY.RENEWAL_PENDING), or the revocation gate refuses it (for example PROVISIONING.ANOTHER_IT_ADMIN_NEEDED when the IT Admin is the holder). Nothing is written.',
      examples: [
        EXAMPLES.NOT_OPEN,
        EXAMPLES.NOT_EXPIRED,
        EXAMPLES.RENEWAL_PENDING,
        EXAMPLES.REVOCATION_TYPE_NOT_SUPPORTED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not valid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async startRevocation(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ExpiryAssignmentParamDto) {
    try {
      return { revocation: await this.queue.startRevocation(actor, params.assignmentId) };
    } catch (error) {
      throw toExpiryApiException(error);
    }
  }

  @Get('assignment-expiry-reminders')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'assignmentExpiryReminderList',
    summary: 'List the reminders that a right is about to end',
  })
  @ApiSuccessResponse(ExpiryReminderPageResponseDto, {
    message: 'ASSIGNMENT_EXPIRY_REMINDER.LISTED',
    description:
      'A page of the reminders sent seven days before a right ends, the newest first. By default (scope mine) those sent to the caller: as the holder of the right, as the head of the holder, or as the IT Admin in charge. With scope all an IT Admin reads everyone. A reminder names the right, the person it was sent to, the holder, the tool and the end day, and offers two choices: to renew the right, or to let it end. A department without a head has no reminder for the head.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin asks for scope all (ASSIGNMENT_EXPIRY.SCOPE_FORBIDDEN).',
      examples: [EXAMPLES.SCOPE_FORBIDDEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'A filter is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async listReminders(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListExpiryRemindersQueryDto) {
    try {
      return await this.reminders.list(actor, query);
    } catch (error) {
      throw toExpiryApiException(error);
    }
  }
}
