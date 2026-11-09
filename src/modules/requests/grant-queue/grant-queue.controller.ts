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
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { GrantQueueQueryDto, GrantQueueResponseDto } from './grant-queue.dto';
import { GrantQueueService } from './grant-queue.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** The IT Admin reads what waits for them to carry out (`US-03-02`). */
@ApiTags('grant-queue')
@Controller({ version: '1' })
export class GrantQueueController {
  constructor(private readonly queue: GrantQueueService) {}

  @Get('grant-queue')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'grantQueueList', summary: 'List the requests waiting to be carried out' })
  @ApiSuccessResponse(GrantQueueResponseDto, {
    message: 'GRANT_QUEUE.LISTED',
    description:
      'The requests approved in full that the IT Admin has not carried out yet, kept together by the person they are for, then by when they were sent. Each says who asked, the tool, and the day the access ends for a person who is not staff.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin reads what waits to be carried out.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async grantQueue(@Query() query: GrantQueueQueryDto) {
    try {
      return await this.queue.page(query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
