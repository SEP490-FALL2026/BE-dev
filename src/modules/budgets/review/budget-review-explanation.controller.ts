import { Body, Controller, HttpStatus, Param, Put } from '@nestjs/common';
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
import { ExplainLineBodyDto, ExplainLineParamDto, ExplainedLineResponseDto } from './budget-review-explanation.dto';
import { BudgetReviewExplanationService } from './budget-review-explanation.service';
import { BUDGET_REVIEW_ERROR_EXAMPLES as EXAMPLES, toBudgetReviewApiException } from './budget-review.http-errors';

/**
 * The explanation of a Cost Center in a quarterly review (`RV-3`, `QĐ-111ah`): the head of the department of the Cost Center says why it is yellow, red or under what it should have
 * used, whether it happened once or goes on, what the department does about it and what it already knows it will need to the end of the year.
 */
@ApiTags('budget-review-periods')
@Controller({ path: 'budget-review-periods', version: '1' })
export class BudgetReviewExplanationController {
  constructor(private readonly explanations: BudgetReviewExplanationService) {}

  @Put(':id/lines/:costCenterId/explanation')
  @RequireRoles('MANAGER')
  @ApiOperation({
    operationId: 'budgetReviewLineExplain',
    summary: 'Explain a Cost Center of a quarterly review',
  })
  @ApiSuccessResponse(ExplainedLineResponseDto, {
    message: 'BUDGET_REVIEW.LINE_EXPLAINED',
    description:
      'The head of the department of the Cost Center explains a line of a quarter that waits for explanations and was asked (yellow, red or under): the cause, once or ongoing, the action and what is already known of the need to the end of the year. It can be written again until Finance signs. The deadline is five working days from the close and only reminds: an explanation is never refused for being late.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller does not hold the manager role (AUTHORIZATION.FORBIDDEN) or is not the head of the department of this Cost Center (BUDGET.NOT_YOUR_COST_CENTER); only the head explains.',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_YOUR_COST_CENTER],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The review period does not exist (BUDGET_REVIEW.NOT_FOUND), or it has no line for the Cost Center (BUDGET_REVIEW.LINE_NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND, EXAMPLES.LINE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The period is not waiting for explanations: a month, or a quarter that Finance signed (BUDGET_REVIEW.NOT_AWAITING_EXPLANATIONS).',
      examples: [EXAMPLES.NOT_AWAITING_EXPLANATIONS],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR; also the amount known to be needed that is not a plain number), the amount has more decimals than the reporting currency allows (MONEY_SCALE_EXCEEDED) or is below nothing or too large (MONEY_OUT_OF_RANGE), or the line was not asked for an explanation because it is green (BUDGET_REVIEW.EXPLANATION_NOT_REQUIRED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.MONEY_OUT_OF_RANGE,
        EXAMPLES.EXPLANATION_NOT_REQUIRED,
      ],
    },
  )
  async explain(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ExplainLineParamDto,
    @Body() body: ExplainLineBodyDto,
  ) {
    try {
      return await this.explanations.explain(actor, params.id, params.costCenterId, body);
    } catch (error) {
      throw toBudgetReviewApiException(error);
    }
  }
}
