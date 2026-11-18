import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
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
import { InvocationContentParamDto, InvocationContentResponseDto } from './invocation-content.dto';
import {
  INVOCATION_CONTENT_ERROR_EXAMPLES as EXAMPLES,
  toInvocationContentApiException,
} from './invocation-content.http-errors';
import { InvocationContentQueryService } from './invocation-content-query.service';

/**
 * What was said to the AI and what it answered, for the Super Admin only (`OQ-G-06`): the owner of a call who is not the Super Admin
 * does not read it either. Each read is in the Audit Trail with the id of the call.
 */
@ApiTags('ai-assist')
@Controller({ path: 'ai/invocations', version: '1' })
export class InvocationContentController {
  constructor(private readonly contents: InvocationContentQueryService) {}

  @Get(':invocationId/content')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'aiInvocationContentGet', summary: 'Read the content of a call of the AI' })
  @ApiSuccessResponse(InvocationContentResponseDto, {
    message: 'AI.CONTENT_READ',
    description:
      'The context sent to the AI service, the prompt, the raw answer, the parsed output and the result of the checks of the backend, as stored. The fields a call never got (it failed before the model answered) are null. Every read writes the event AI_INVOCATION.CONTENT_READ with the id of the call, in the same transaction.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin reads the content of a call of the AI, whoever made the call.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not a UUID (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'There is no content for the id: the call was never made, or its content was purged (AI.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
  )
  async read(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: InvocationContentParamDto) {
    try {
      return await this.contents.read(actor, params.invocationId);
    } catch (error) {
      throw toInvocationContentApiException(error);
    }
  }
}
