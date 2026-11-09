import { Body, Controller, Get, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  CreateQueueSummaryBodyDto,
  QueueSummaryAcceptedResponseDto,
  QueueSummaryParamDto,
  QueueSummaryResponseDto,
  QueueSummarySourceResponseDto,
} from './queue-summary.dto';
import { QUEUE_SUMMARY_ERROR_EXAMPLES as EXAMPLES, toQueueSummaryApiException } from './queue-summary.http-errors';
import { QueueSummaryService } from './queue-summary.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const SWITCH_OFF = {
  status: HttpStatus.FORBIDDEN,
  description: 'The AI summary of the queue is switched off (AI.DISABLED).',
  examples: [EXAMPLES.DISABLED],
} as const;
const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
/** The 503 of every guarded route, and AI.PROVIDER_UNAVAILABLE when no AI service is configured. */
const UNAVAILABLE_OR_NO_AI_SERVICE = {
  ...GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  examples: [...GUARDED_SERVICE_UNAVAILABLE_RESPONSE.examples, EXAMPLES.PROVIDER_UNAVAILABLE],
} as const;

/**
 * The AI summary of the approval steps that wait for the person who calls (`US-15-05`), on demand only. Any signed-in account may
 * call: what is read and summarised is only the steps given to the caller, and a summary is its owner's alone. A summary that cannot
 * be made never changes the queue the person reads by hand; the model's output is checked before any line is shown.
 */
@ApiTags('ai-assist')
@Controller({ path: 'ai/access-request-summaries', version: '1' })
export class QueueSummaryController {
  constructor(private readonly summaries: QueueSummaryService) {}

  // `source` is a literal path: declared before `:invocationId` so the param route never takes it.
  @Get('source')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'aiAccessRequestSummarySource', summary: 'Read the queue a summary would cover' })
  @ApiSuccessResponse(QueueSummarySourceResponseDto, {
    message: 'AI.SUMMARY_SOURCE_READ',
    description:
      'The revision of the queue of approval steps given to the caller now, how many steps a summary would cover (at most 20) and how many it would leave out. Send the revision when asking for a summary. The AI service is not called and nothing is written. With no step waiting the answer is still 200, with stepCount 0.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SWITCH_OFF)
  async source(@CurrentPrincipal() actor: AuthenticatedPrincipal) {
    try {
      return await this.summaries.readSource(actor);
    } catch (error) {
      throw toQueueSummaryApiException(error);
    }
  }

  @Post()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'aiAccessRequestSummaryCreate', summary: 'Ask for a summary of my approval queue' })
  @ApiSuccessResponse(QueueSummaryAcceptedResponseDto, {
    status: HttpStatus.ACCEPTED,
    message: 'AI.SUMMARY_ACCEPTED',
    description:
      'The call is recorded and runs in the background; read it with GET until it is no longer PENDING or RUNNING. Asking again for the same revision gives the call already kept for it. When the steps of the caller cannot be read the answer is still 202, with status FAILED: nothing was sent to the model and the queue read by hand is unchanged. The model is never called when no step waits for the caller. With no AI service configured the answer is 503 AI.PROVIDER_UNAVAILABLE and nothing is written.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    UNAVAILABLE_OR_NO_AI_SERVICE,
    VALIDATION_ERROR,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The AI summary of the queue is switched off (AI.DISABLED), or no approval step waits for the caller (AI.NO_ASSIGNED_STEPS).',
      examples: [EXAMPLES.DISABLED, EXAMPLES.NO_ASSIGNED_STEPS],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The queue changed since the revision was read (AI.SOURCE_STALE): read it again and ask again.',
      examples: [EXAMPLES.SOURCE_STALE],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateQueueSummaryBodyDto) {
    try {
      return await this.summaries.create(actor, body);
    } catch (error) {
      throw toQueueSummaryApiException(error);
    }
  }

  @Get(':invocationId')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'aiAccessRequestSummaryGet', summary: 'Read a summary of my approval queue' })
  @ApiSuccessResponse(QueueSummaryResponseDto, {
    message: 'AI.SUMMARY_READ',
    description:
      'The summary of the caller read against the queue now: a line shows only while its step still waits for the caller, omittedCount counts the steps still theirs that it leaves out, and sourceStale says the queue changed since it was composed. A call that shows nothing carries its state in status and errorCode (AI.PROVIDER_UNAVAILABLE, AI.PROVIDER_TIMEOUT, AI.OUTPUT_INVALID, AI.NO_VALID_OUTPUT, AI.SOURCE_UNREADABLE, AI.INTERNAL_ERROR) with 200, never as an HTTP error; the queue read by hand is unchanged.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, {
    status: HttpStatus.NOT_FOUND,
    description: "There is no such summary, or it is somebody else's (AI.NOT_FOUND).",
    examples: [EXAMPLES.NOT_FOUND],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: QueueSummaryParamDto) {
    try {
      const { items, ...summary } = await this.summaries.get(actor, params.invocationId);

      // The lines are `lines` on the wire: a GET with an `items` array is a collection to the contract gate, and this is one summary.
      return { ...summary, lines: items };
    } catch (error) {
      throw toQueueSummaryApiException(error);
    }
  }
}
